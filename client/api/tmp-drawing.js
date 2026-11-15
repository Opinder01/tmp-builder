import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { IncomingForm } from "formidable";
import { readFileSync } from "fs";

export const config = { api: { bodyParser: false } };

const ALLOWED_ORIGINS = new Set([
  "https://tmpbuilder.ca", "https://www.tmpbuilder.ca",
  "http://localhost:3000", "http://localhost:5173", "http://localhost:4173",
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set.");
  return createClient(url, key);
}

export default async function handler(req, res) {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return json(res, 204, {});

  const action = req.query?.action;

  // ── GET: fetch order status by session_id ──────────────────────────────────
  if (req.method === "GET" && action === "order-status") {
    const sessionId = req.query?.session_id;
    if (!sessionId) return json(res, 400, { error: "session_id required." });
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("tmp_drawing_orders")
        .select("id,customer_name,customer_email,num_drawings,payment_status,order_status,created_at,site_address,work_type")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(res, 404, { error: "Order not found." });
      return json(res, 200, { order: data });
    } catch (err) {
      console.error("[tmp-drawing] order-status error:", err.message);
      return json(res, 500, { error: "Failed to fetch order." });
    }
  }

  // ── POST: create order + Stripe checkout ──────────────────────────────────
  if (req.method === "POST" && action === "create-order") {
    // Parse multipart form data (supports file attachments)
    const { fields, files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ multiples: true, maxFileSize: 20 * 1024 * 1024 });
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    });

    const f = (key) => (Array.isArray(fields[key]) ? fields[key][0] : fields[key]) || "";
    const customerName       = f("customerName");
    const customerEmail      = f("customerEmail");
    const customerPhone      = f("customerPhone");
    const companyName        = f("companyName");
    const siteAddress        = f("siteAddress");
    const workType           = f("workType");
    const workDescription    = f("workDescription");
    const numDrawings        = f("numDrawings");
    const specialRequirements = f("specialRequirements");

    if (!customerName || !customerEmail || !siteAddress || !workType || !workDescription) {
      return json(res, 400, { error: "Required fields missing." });
    }
    if (!customerEmail.includes("@")) {
      return json(res, 400, { error: "Invalid email." });
    }
    const qty = Math.max(1, Math.min(50, parseInt(numDrawings, 10) || 1));

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId   = process.env.STRIPE_PRICE_TMP_DRAWING;
    if (!secretKey || !priceId) {
      return json(res, 500, { error: "Payment service not configured." });
    }

    let orderId;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("tmp_drawing_orders")
        .insert({
          customer_name:        customerName.trim(),
          customer_email:       customerEmail.toLowerCase().trim(),
          customer_phone:       customerPhone?.trim() || null,
          company_name:         companyName?.trim() || null,
          site_address:         siteAddress.trim(),
          work_type:            workType.trim(),
          work_description:     workDescription.trim(),
          num_drawings:         qty,
          special_requirements: specialRequirements?.trim() || null,
          payment_status:       "pending",
          order_status:         "pending",
        })
        .select("id")
        .single();
      if (error) throw error;
      orderId = data.id;
    } catch (err) {
      console.error("[tmp-drawing] DB insert error:", err.message);
      return json(res, 500, { error: "Failed to save order." });
    }

    // Upload attachments to Supabase Storage
    const attachmentUrls = [];
    const attachmentList = files?.attachments
      ? (Array.isArray(files.attachments) ? files.attachments : [files.attachments])
      : [];
    if (attachmentList.length > 0) {
      try {
        const supabase = getSupabase();
        for (const file of attachmentList) {
          const fileData = readFileSync(file.filepath);
          const ext = file.originalFilename?.split(".").pop() || "bin";
          const path = `${orderId}/${Date.now()}-${file.originalFilename}`;
          const { error: uploadErr } = await supabase.storage
            .from("tmp-drawing-attachments")
            .upload(path, fileData, { contentType: file.mimetype || "application/octet-stream" });
          if (!uploadErr) {
            const { data: { publicUrl } } = supabase.storage
              .from("tmp-drawing-attachments")
              .getPublicUrl(path);
            attachmentUrls.push(publicUrl);
          }
        }
        if (attachmentUrls.length > 0) {
          const supabase2 = getSupabase();
          await supabase2.from("tmp_drawing_orders").update({ attachments: attachmentUrls }).eq("id", orderId);
        }
      } catch (uploadErr) {
        console.error("[tmp-drawing] attachment upload error:", uploadErr.message);
        // Non-fatal — continue without attachments
      }
    }

    const appUrl = (process.env.APP_URL || "https://tmpbuilder.ca").replace(/\/$/, "");
    const stripe  = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" });

    try {
      const session = await stripe.checkout.sessions.create({
        mode:         "payment",
        line_items:   [{ price: priceId, quantity: qty }],
        customer_email: customerEmail.toLowerCase().trim(),
        metadata: {
          order_type:    "tmp_drawing",
          order_id:      orderId,
          customer_name: customerName.trim(),
          num_drawings:  String(qty),
        },
        success_url: `${appUrl}/tmp-order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/we-make-your-tmp`,
      });

      // Save the session ID back to the order row
      const supabase = getSupabase();
      await supabase
        .from("tmp_drawing_orders")
        .update({ stripe_session_id: session.id })
        .eq("id", orderId);

      return json(res, 200, { url: session.url });
    } catch (err) {
      console.error("[tmp-drawing] Stripe error:", err.message);
      return json(res, 500, { error: "Failed to create payment session." });
    }
  }

  return json(res, 404, { error: "Not found." });
}
