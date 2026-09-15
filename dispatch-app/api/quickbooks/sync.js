import { getSupabaseAdmin } from "../_lib/supabase.js";
import { qboFetch, qboQuery } from "../_lib/qbo.js";
import { splitShiftHours, hoursToHM } from "../_lib/overtime.js";

async function alreadySynced(timesheetId, target) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("qbo_sync_log")
    .select("id")
    .eq("timesheet_id", timesheetId)
    .eq("target", target)
    .eq("status", "success")
    .limit(1);
  return (data || []).length > 0;
}

async function logSync({ target, timesheetId, jobNumber, workerId, qboEntityType, qboEntityId, request, response, status, errorMessage }) {
  const supabase = getSupabaseAdmin();
  await supabase.from("qbo_sync_log").insert({
    target,
    timesheet_id: timesheetId,
    job_number: jobNumber,
    worker_id: workerId,
    qbo_entity_type: qboEntityType,
    qbo_entity_id: qboEntityId,
    request_payload: request,
    response_payload: response,
    status,
    error_message: errorMessage,
  });
}

async function findOrCreateVendor(workerName, existingVendorId) {
  if (existingVendorId) return existingVendorId;

  const escaped = workerName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const found = await qboQuery(`SELECT Id FROM Vendor WHERE DisplayName = '${escaped}'`);
  if (found.QueryResponse?.Vendor?.length) return found.QueryResponse.Vendor[0].Id;

  const created = await qboFetch("/vendor", { method: "POST", body: { DisplayName: workerName } });
  return created.Vendor.Id;
}

async function findOrCreateEmployee(workerName, existingEmployeeId) {
  if (existingEmployeeId) return existingEmployeeId;

  const escaped = workerName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const found = await qboQuery(`SELECT Id FROM Employee WHERE DisplayName = '${escaped}'`);
  if (found.QueryResponse?.Employee?.length) return found.QueryResponse.Employee[0].Id;

  const [givenName, ...rest] = workerName.split(" ");
  const created = await qboFetch("/employee", {
    method: "POST",
    body: { GivenName: givenName, FamilyName: rest.join(" ") || givenName, DisplayName: workerName },
  });
  return created.Employee.Id;
}

let cachedExpenseAccountId = null;
async function getContractorExpenseAccountId() {
  if (process.env.QBO_CONTRACTOR_EXPENSE_ACCOUNT_ID) return process.env.QBO_CONTRACTOR_EXPENSE_ACCOUNT_ID;
  if (cachedExpenseAccountId) return cachedExpenseAccountId;

  const preferred = await qboQuery(
    `SELECT Id FROM Account WHERE AccountType = 'Expense' AND Name LIKE '%Subcontract%' MAXRESULTS 1`
  );
  const fallback = preferred.QueryResponse?.Account?.length
    ? preferred
    : await qboQuery(`SELECT Id FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1`);

  const accountId = fallback.QueryResponse?.Account?.[0]?.Id;
  if (!accountId) throw new Error("No QuickBooks Expense account found to post contractor bills against.");
  cachedExpenseAccountId = accountId;
  return accountId;
}

// Called after an admin approves a timesheet. Never throws — every failure
// is caught and written to qbo_sync_log so a broken QuickBooks connection
// doesn't block approvals; failures are visible and retryable from the
// QuickBooks settings screen.
//
// Neither customer invoicing nor contractor pay is synced here — both are
// batched (see createCustomerInvoice / createContractorBill below and
// api/quickbooks/customer-invoice.js / contractor-bill.js), matching how
// Crown actually invoices (multiple shifts combined onto one invoice/bill),
// not one per shift.
export async function syncApprovedTimesheet(timesheet, dispatch, worker) {
  const results = { payroll: null };

  // Employee hours -> TimeActivity. Contractors are handled separately (batched monthly).
  if (worker.worker_type !== "employee") return results;

  if (await alreadySynced(timesheet.id, "payroll_time_activity")) {
    results.payroll = "already synced";
    return results;
  }

  try {
    const employeeId = await findOrCreateEmployee(worker.full_name, worker.qbo_employee_id);
    if (employeeId !== worker.qbo_employee_id) {
      await getSupabaseAdmin().from("profiles").update({ qbo_employee_id: employeeId }).eq("id", worker.id);
    }

    // Regular/overtime/doubletime split per shift (8 / next 3 / rest) — never
    // combined across two shifts in the same day, since this is computed
    // purely from this one timesheet's own calculated_hours.
    const split = splitShiftHours(timesheet.calculated_hours);
    const entries = [
      { label: "Regular", hours: split.regular },
      { label: "Overtime", hours: split.overtime },
      { label: "Doubletime", hours: split.doubletime },
    ].filter((e) => e.hours > 0);

    const created = [];
    for (const entry of entries) {
      const { hours, minutes } = hoursToHM(entry.hours);
      const body = {
        TxnDate: dispatch.start_time.slice(0, 10),
        NameOf: "Employee",
        EmployeeRef: { value: employeeId },
        Hours: hours,
        Minutes: minutes,
        Description: `Job ${dispatch.job_number} — ${dispatch.location} (${entry.label})`,
        ...(dispatch.customer_qbo_id ? { CustomerRef: { value: dispatch.customer_qbo_id } } : {}),
      };
      const data = await qboFetch("/timeactivity", { method: "POST", body });
      await logSync({
        target: "payroll_time_activity",
        timesheetId: timesheet.id,
        jobNumber: dispatch.job_number,
        workerId: worker.id,
        qboEntityType: "TimeActivity",
        qboEntityId: data.TimeActivity.Id,
        request: body,
        response: data,
        status: "success",
      });
      created.push(`${entry.label} ${entry.hours}h`);
    }
    results.payroll = created.length ? `created (${created.join(", ")})` : "no hours to sync";
  } catch (err) {
    await logSync({
      target: "payroll_time_activity",
      timesheetId: timesheet.id,
      jobNumber: dispatch.job_number,
      workerId: worker.id,
      status: "failed",
      errorMessage: err.message,
    });
    results.payroll = `failed: ${err.message}`;
  }

  return results;
}

// Batches every given (already-approved, not-yet-billed) timesheet for one
// contractor into a single QuickBooks Bill — one line per timesheet, same
// pattern as Crown's existing customer invoices (one line per "Timesheet#").
// Called from api/quickbooks/contractor-bill.js's admin-triggered ?action=create.
export async function createContractorBill(worker, timesheets) {
  if (!timesheets.length) throw new Error("No timesheets to bill.");
  if (worker.contractor_bill_rate == null) {
    throw new Error(`${worker.full_name} has no pay rate set — cannot compute a Bill amount.`);
  }

  const vendorId = await findOrCreateVendor(worker.full_name, worker.qbo_vendor_id);
  if (vendorId !== worker.qbo_vendor_id) {
    await getSupabaseAdmin().from("profiles").update({ qbo_vendor_id: vendorId }).eq("id", worker.id);
  }
  const accountId = await getContractorExpenseAccountId();

  const body = {
    VendorRef: { value: vendorId },
    Line: timesheets.map((t) => ({
      Amount: t.calculated_hours * worker.contractor_bill_rate,
      DetailType: "AccountBasedExpenseLineDetail",
      Description: `Job ${t.dispatch.job_number} — ${t.dispatch.location}, ${new Date(t.dispatch.start_time).toLocaleDateString()}, ${t.calculated_hours}h`,
      AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
    })),
  };

  const data = await qboFetch("/bill", { method: "POST", body });

  await Promise.all(
    timesheets.map((t) =>
      logSync({
        target: "vendor_bill",
        timesheetId: t.id,
        jobNumber: t.dispatch.job_number,
        workerId: worker.id,
        qboEntityType: "Bill",
        qboEntityId: data.Bill.Id,
        request: body,
        response: data,
        status: "success",
      })
    )
  );

  return { billId: data.Bill.Id, totalAmount: data.Bill.TotalAmt, timesheetCount: timesheets.length };
}

// Batches every given (already-approved, not-yet-invoiced) timesheet for one
// customer into a single QuickBooks Invoice. Each shift is split into
// regular/overtime/doubletime (8 / next 3 / rest, per-shift only) and gets
// one invoice line per portion that actually has a rate item configured on
// its dispatch — a portion with hours but no matching item/rate is skipped
// (not billed at $0) and reported back so the admin can see what was left out.
// Called from api/quickbooks/customer-invoice.js's admin-triggered ?action=create.
export async function createCustomerInvoice(customerId, timesheets) {
  if (!timesheets.length) throw new Error("No timesheets to invoice.");

  const lines = [];
  const skipped = [];

  for (const t of timesheets) {
    const split = splitShiftHours(t.calculated_hours);
    const portions = [
      { label: "", hours: split.regular, itemId: t.dispatch.qbo_item_id, rate: t.dispatch.rate },
      { label: " (overtime)", hours: split.overtime, itemId: t.dispatch.qbo_ot_item_id, rate: t.dispatch.ot_rate },
      { label: " (doubletime)", hours: split.doubletime, itemId: t.dispatch.qbo_dt_item_id, rate: t.dispatch.dt_rate },
    ];

    for (const p of portions) {
      if (p.hours <= 0) continue;
      if (!p.itemId || p.rate == null) {
        if (p.hours > 0 && p.label) skipped.push(`Job ${t.dispatch.job_number}: ${p.hours}h${p.label} — no rate set`);
        continue;
      }
      lines.push({
        Amount: p.hours * p.rate,
        DetailType: "SalesItemLineDetail",
        Description: `Job ${t.dispatch.job_number} — ${t.dispatch.location}, ${new Date(t.dispatch.start_time).toLocaleDateString()} (${t.worker_full_name})${p.label}`,
        SalesItemLineDetail: { ItemRef: { value: p.itemId }, Qty: p.hours, UnitPrice: p.rate },
      });
    }
  }

  if (!lines.length) throw new Error("Nothing billable — no regular rate set on any selected shift.");

  const body = { CustomerRef: { value: customerId }, Line: lines };
  const data = await qboFetch("/invoice", { method: "POST", body });

  await Promise.all(
    timesheets.map((t) =>
      logSync({
        target: "invoice",
        timesheetId: t.id,
        jobNumber: t.dispatch.job_number,
        workerId: t.worker_id,
        qboEntityType: "Invoice",
        qboEntityId: data.Invoice.Id,
        request: body,
        response: data,
        status: "success",
      })
    )
  );

  return {
    invoiceId: data.Invoice.Id,
    totalAmount: data.Invoice.TotalAmt,
    timesheetCount: timesheets.length,
    skipped,
  };
}
