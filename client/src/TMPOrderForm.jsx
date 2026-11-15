import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const WORK_TYPES = [
  "Lane Closure",
  "Road Closure",
  "Sidewalk Closure",
  "Intersection Control",
  "Shoulder Closure",
  "Multi-Lane Closure",
  "Driveway Access",
  "Other",
];

const inp = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  fontSize: 14,
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  background: "#f8fafc",
  color: "#0f172a",
};

const sel = { ...inp, appearance: "none" };

export default function TMPOrderForm() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    companyName: "",
    siteAddress: "",
    workType: "",
    workDescription: "",
    numDrawings: "1",
    specialRequirements: "",
  });

  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [touched, setTouched]   = useState({});
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");

  function field(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function blur(name) {
    setTouched((t) => ({ ...t, [name]: true }));
  }

  function validate() {
    const e = {};
    if (!form.customerName.trim())     e.customerName    = "Name is required.";
    const em = form.customerEmail.trim();
    if (!em)                           e.customerEmail   = "Email is required.";
    else if (!em.includes("@"))        e.customerEmail   = "Enter a valid email.";
    if (!form.customerPhone.trim())    e.customerPhone   = "Phone number is required.";
    if (!form.companyName.trim())      e.companyName     = "Company name is required.";
    if (!form.siteAddress.trim())      e.siteAddress     = "Site address is required.";
    if (!form.workType)                e.workType        = "Select a work type.";
    if (!form.workDescription.trim())  e.workDescription = "Please describe the work.";
    const qty = parseInt(form.numDrawings, 10);
    if (!qty || qty < 1 || qty > 50)   e.numDrawings     = "Enter a number between 1 and 50.";
    return e;
  }

  const errors = validate();
  const totalAmount = (parseInt(form.numDrawings, 10) || 1) * 200;

  function deliveryDays(qty) {
    if (qty <= 2) return "2 business days";
    if (qty <= 4) return "3 business days";
    if (qty <= 6) return "4 business days";
    if (qty <= 10) return "5 business days";
    return null;
  }
  const qty = parseInt(form.numDrawings, 10) || 1;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ customerName: true, customerEmail: true, customerPhone: true, companyName: true, siteAddress: true, workType: true, workDescription: true, numDrawings: true });
    if (Object.keys(errors).length) return;
    if (!agreedToTerms) { setError("You must read and agree to the Terms & Agreement before proceeding."); return; }

    setLoading(true);
    setError("");

    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      attachments.forEach((f) => fd.append("attachments", f));
      const res  = await fetch("/api/tmp-drawing?action=create-order", {
        method: "POST",
        body:   fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create order.");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter,system-ui,-apple-system,Arial,sans-serif" }}>

      {/* Nav */}
      <nav style={{ background: "#0f172a", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => nav("/")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <img src="/logo.png" alt="TMP Builder" style={{ height: 32 }} />
        </button>
        <button onClick={() => nav("/we-make-your-tmp")} style={{ background: "none", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>
          ← Back
        </button>
      </nav>

      {/* Form */}
      <div style={{ maxWidth: 640, margin: "48px auto 80px", padding: "0 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
            We Make Your TMP
          </div>
          <h1 style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 800, color: "#0f172a", margin: "0 0 10px" }}>
            Order Your Drawing
          </h1>
          <p style={{ fontSize: 15, color: "#64748b", margin: 0 }}>
            Fill in the details below. We'll create your BC TMM MOTI 2020-compliant traffic management plan and deliver it within 2 days.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Card: Contact */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 20px" }}>Contact Information</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Full Name *</span>
                <input
                  value={form.customerName}
                  onChange={(e) => field("customerName", e.target.value)}
                  onBlur={() => blur("customerName")}
                  placeholder="Jane Smith"
                  style={{ ...inp, borderColor: touched.customerName && errors.customerName ? "#ef4444" : "#e2e8f0" }}
                />
                {touched.customerName && errors.customerName && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.customerName}</span>}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Email Address *</span>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => field("customerEmail", e.target.value)}
                  onBlur={() => blur("customerEmail")}
                  placeholder="jane@company.com"
                  style={{ ...inp, borderColor: touched.customerEmail && errors.customerEmail ? "#ef4444" : "#e2e8f0" }}
                />
                {touched.customerEmail && errors.customerEmail && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.customerEmail}</span>}
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Phone *</span>
                  <input
                    value={form.customerPhone}
                    onChange={(e) => field("customerPhone", e.target.value)}
                    onBlur={() => blur("customerPhone")}
                    placeholder="(604) 555-0100"
                    style={{ ...inp, borderColor: touched.customerPhone && errors.customerPhone ? "#ef4444" : "#e2e8f0" }}
                  />
                  {touched.customerPhone && errors.customerPhone && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.customerPhone}</span>}
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Company *</span>
                  <input
                    value={form.companyName}
                    onChange={(e) => field("companyName", e.target.value)}
                    onBlur={() => blur("companyName")}
                    placeholder="ABC Traffic Control"
                    style={{ ...inp, borderColor: touched.companyName && errors.companyName ? "#ef4444" : "#e2e8f0" }}
                  />
                  {touched.companyName && errors.companyName && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.companyName}</span>}
                </label>
              </div>
            </div>
          </div>

          {/* Card: Job Details */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Job Details</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 20px" }}>You can attach a photo or sketch of the job area to help us mark it accurately.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Site Address / Location *</span>
                <input
                  value={form.siteAddress}
                  onChange={(e) => field("siteAddress", e.target.value)}
                  onBlur={() => blur("siteAddress")}
                  placeholder="1234 Main St, Victoria, BC"
                  style={{ ...inp, borderColor: touched.siteAddress && errors.siteAddress ? "#ef4444" : "#e2e8f0" }}
                />
                {touched.siteAddress && errors.siteAddress && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.siteAddress}</span>}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Type of Work *</span>
                <div style={{ position: "relative" }}>
                  <select
                    value={form.workType}
                    onChange={(e) => field("workType", e.target.value)}
                    onBlur={() => blur("workType")}
                    style={{ ...sel, borderColor: touched.workType && errors.workType ? "#ef4444" : "#e2e8f0" }}
                  >
                    <option value="">Select work type…</option>
                    {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }}>▾</span>
                </div>
                {touched.workType && errors.workType && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.workType}</span>}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Description of Work *</span>
                <textarea
                  rows={4}
                  value={form.workDescription}
                  onChange={(e) => field("workDescription", e.target.value)}
                  onBlur={() => blur("workDescription")}
                  placeholder="Describe the work: number of lanes affected, direction of traffic flow, work duration, special considerations, etc."
                  style={{ ...inp, resize: "vertical", borderColor: touched.workDescription && errors.workDescription ? "#ef4444" : "#e2e8f0" }}
                />
                {touched.workDescription && errors.workDescription && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.workDescription}</span>}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Special Requirements (optional)</span>
                <textarea
                  rows={3}
                  value={form.specialRequirements}
                  onChange={(e) => field("specialRequirements", e.target.value)}
                  placeholder="Any specific sign types, flagger positions, reference plans, or other notes for the drafter…"
                  style={{ ...inp, resize: "vertical" }}
                />
              </label>

              {/* Attachments — inline under Job Details */}
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", display: "block", marginBottom: 5 }}>
                  Attach Job Area Files (optional)
                </span>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px" }}>
                  Mark the job area on a map or photo and attach it here: PDF, image, or drawing.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.dwg,.dxf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files);
                    setAttachments((prev) => [...prev, ...newFiles]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 8, padding: "11px 16px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer", width: "100%", boxSizing: "border-box" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  Click to attach files
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>PDF, JPG, PNG, DWG</span>
                </button>
                {attachments.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                    {attachments.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "8px 12px" }}>
                        {f.name.toLowerCase().endsWith(".pdf")
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                        <span style={{ fontSize: 13, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card: Order Summary */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 20px" }}>Order Summary</h2>

            <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Number of Drawings *</span>
              <input
                type="number"
                min="1"
                max="50"
                value={form.numDrawings}
                onChange={(e) => field("numDrawings", e.target.value)}
                onBlur={() => blur("numDrawings")}
                style={{ ...inp, maxWidth: 120, borderColor: touched.numDrawings && errors.numDrawings ? "#ef4444" : "#e2e8f0" }}
              />
              {touched.numDrawings && errors.numDrawings && <span style={{ fontSize: 12, color: "#ef4444" }}>{errors.numDrawings}</span>}
              <span style={{ fontSize: 12, color: "#94a3b8" }}>CA$200 per drawing</span>
            </label>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: "#64748b" }}>
                  {parseInt(form.numDrawings, 10) || 1} drawing{(parseInt(form.numDrawings, 10) || 1) !== 1 ? "s" : ""} × CA$200
                </span>
                <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 600 }}>
                  CA${totalAmount.toFixed(2)}
                </span>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#f97316" }}>CA${totalAmount.toFixed(2)}</span>
              </div>
              {deliveryDays(qty) ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "10px 14px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span style={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>
                    Your {qty === 1 ? "drawing" : `${qty} drawings`} will be delivered within <strong>{deliveryDays(qty)}</strong> of payment.
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "10px 14px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500, lineHeight: 1.5 }}>
                    You have selected <strong>{qty} drawings</strong>. We will review your request and email you to confirm the timeline before work begins.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Terms & Agreement */}
          <div style={{ background: "#fff", border: agreedToTerms ? "1.5px solid #16a34a" : "1.5px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Terms &amp; Agreement</h2>
              <button
                type="button"
                onClick={() => setTermsExpanded((v) => !v)}
                style={{ background: "none", border: "none", fontSize: 12, fontWeight: 600, color: "#f97316", cursor: "pointer", padding: 0 }}
              >
                {termsExpanded ? "Hide" : "Read Full Terms"}
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.6 }}>
              By placing this order you confirm you have read and agree to the following terms governing the TMP drafting service provided through TMP Builder, in partnership with <strong>Crown Traffic Management Ltd.</strong>
            </p>

            {termsExpanded && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 18px", marginBottom: 16, fontSize: 12.5, color: "#334155", lineHeight: 1.75, maxHeight: 340, overflowY: "auto" }}>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>1. Service Provider &amp; Partnership</p>
                <p style={{ margin: "0 0 12px" }}>TMP Builder (tmpbuilder.ca) facilitates the drafting of Traffic Management Plans (TMPs) in partnership with Crown Traffic Management Ltd. ("CTM"), a BC-based traffic management company carrying valid professional liability and commercial general liability insurance as required under WorkSafeBC regulations. All TMP drawings are prepared by CTM-certified personnel with current TMM MOTI 2020 training.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>2. BC Compliance Standard</p>
                <p style={{ margin: "0 0 12px" }}>All drawings are prepared to comply with the BC Traffic Management Manual for Work on Roadways (TMM MOTI 2020) and are consistent with applicable requirements under the BC Motor Vehicle Act, the Occupational Health and Safety (OHS) Regulation (WorkSafeBC Part 18 — Traffic Control), and any applicable municipal or provincial permit requirements. The customer is solely responsible for obtaining all required permits and approvals from the relevant authority having jurisdiction (AHJ).</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>3. Customer Responsibilities</p>
                <p style={{ margin: "0 0 12px" }}>The customer acknowledges that the TMP provided is a site-specific drawing prepared based on the information supplied at the time of order. The customer (contractor) is responsible for: (a) ensuring a qualified Traffic Control Supervisor (TCS) or Traffic Control Person (TCP) certified under WorkSafeBC is present on site at all times during the work; (b) verifying that the plan accurately reflects actual site conditions before implementation; (c) adapting the plan to any changes in site conditions, scope of work, or authority requirements; and (d) ensuring all workers and subcontractors on site are aware of, and comply with, the TMP.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>4. Accuracy of Information</p>
                <p style={{ margin: "0 0 12px" }}>The customer warrants that all job details, site addresses, work descriptions, and attachments submitted are accurate and complete. TMP Builder and GTM accept no liability for errors in the resulting plan arising from inaccurate or incomplete information provided by the customer.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>5. Limitation of Liability</p>
                <p style={{ margin: "0 0 12px" }}>The TMP is provided as a professional planning document only. TMP Builder and CTM are not responsible for incidents, injuries, property damage, fines, or enforcement actions that occur on-site during implementation of the plan. The customer and their on-site personnel bear full operational responsibility under the BC OHS Regulation Part 18. Total liability of TMP Builder and CTM to the customer shall not exceed the amount paid for the specific drawing order in dispute.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>6. Revisions</p>
                <p style={{ margin: "0 0 12px" }}>All revisions required due to changes in the information originally provided, or requested to reflect updated site or work scope, are included at no additional charge. Revisions must be requested within 90 days of the original delivery date. Requests constituting a substantially new drawing (different location, different work type) may be treated as a new order.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>7. Delivery &amp; Refunds</p>
                <p style={{ margin: "0 0 12px" }}>Completed drawings are delivered to the customer's email address within the timeframe indicated at the time of order, based on the number of drawings requested: 1–2 drawings within 2 business days; 3–4 drawings within 3 business days; 5–6 drawings within 4 business days; 7–10 drawings within 5 business days. Orders of 11 or more drawings will be reviewed individually and the customer will be contacted by email to confirm the delivery timeline before work begins. If delivery cannot be completed within the agreed timeline, the customer is entitled to a full refund. No refund is available once the completed drawings have been delivered, as the service has been fully rendered at that point.</p>

                <p style={{ fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>8. Intellectual Property</p>
                <p style={{ margin: "0 0 0px" }}>The completed TMP drawing is licensed to the customer for use on the specific project described in the order. The customer may not resell, sublicense, or redistribute the drawing. TMP Builder and GTM retain the right to use anonymized drawings for portfolio, training, or marketing purposes.</p>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => { setAgreedToTerms(e.target.checked); if (e.target.checked) setError(""); }}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: "#f97316", flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                I have read and agree to the <button type="button" onClick={() => setTermsExpanded(true)} style={{ background: "none", border: "none", color: "#f97316", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Terms &amp; Agreement</button>, including the partnership with Crown Traffic Management Ltd. and my responsibilities as the contractor on site.
              </span>
            </label>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 14, color: "#dc2626", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#94a3b8" : "linear-gradient(135deg,#f97316,#ea580c)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              padding: "15px",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating order…" : `Proceed to Payment: CA$${totalAmount.toFixed(2)} →`}
          </button>

          <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", margin: "12px 0 0" }}>
            Secure payment via Stripe. You will be redirected to complete payment.
          </p>
        </form>
      </div>
    </div>
  );
}
