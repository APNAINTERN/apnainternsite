import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichStudentProfileForDisplay } from "@/lib/studentProfileDisplay";

export type CybercafeLeadRow = Record<string, unknown> & {
  status_label?: string;
};

/** Load students, leads, and transactions for an approved cyber cafe partner. */
export async function fetchCybercafeDashboardData(
  client: SupabaseClient,
  partnerEmail?: string
): Promise<{
  applications: Record<string, unknown>[];
  leads: CybercafeLeadRow[];
  transactions: Record<string, unknown>[];
}> {
  let applications: Record<string, unknown>[] = [];
  let transactions: Record<string, unknown>[] = [];
  let cancelled: Record<string, unknown>[] = [];
  let failed: Record<string, unknown>[] = [];

  const cafeEmail = partnerEmail?.trim().toLowerCase();
  if (!cafeEmail) {
    return { applications: [], leads: [], transactions: [] };
  }

  // 1. Students registered under this cyber cafe
  try {
    const { data, error } = await client
      .from("students")
      .select("*")
      .eq("cybercafe_email", cafeEmail)
      .order("created_at", { ascending: false });
    if (!error && data) applications = data as Record<string, unknown>[];
  } catch (err) {
    console.warn("[cybercafe] Failed to fetch students:", err);
  }

  const studentEmails = [
    ...new Set(
      applications
        .map((app) => (app.email as string)?.toLowerCase().trim())
        .filter(Boolean) as string[]
    ),
  ];

  // 2. Transactions: prefer payment_success.cybercafe_email, also include student emails
  try {
    const byCafe = await client
      .from("payment_success")
      .select("*")
      .eq("status", "success")
      .eq("cybercafe_email", cafeEmail)
      .order("created_at", { ascending: false });

    const byStudents =
      studentEmails.length > 0
        ? await client
            .from("payment_success")
            .select("*")
            .eq("status", "success")
            .in("email", studentEmails)
            .order("created_at", { ascending: false })
        : { data: [] as Record<string, unknown>[], error: null };

    if (byCafe.error) console.warn("[cybercafe] payment_success by cafe:", byCafe.error);
    if (byStudents.error) console.warn("[cybercafe] payment_success by students:", byStudents.error);

    const merged = new Map<string, Record<string, unknown>>();
    for (const row of [...(byCafe.data || []), ...((byStudents.data as Record<string, unknown>[]) || [])]) {
      const key = String(
        row.id || `${row.payment_id || ""}:${row.email || ""}:${row.created_at || ""}`
      );
      // Only keep rows tied to this cafe or its students (defense in depth)
      const rowCafe = String(row.cybercafe_email || "")
        .trim()
        .toLowerCase();
      const rowEmail = String(row.email || "")
        .trim()
        .toLowerCase();
      if (rowCafe === cafeEmail || studentEmails.includes(rowEmail)) {
        merged.set(key, row);
      }
    }
    transactions = [...merged.values()].sort(
      (a, b) =>
        new Date(String(b.created_at || 0)).getTime() -
        new Date(String(a.created_at || 0)).getTime()
    );
  } catch (err) {
    console.warn("[cybercafe] Failed to fetch payment_success:", err);
  }

  if (studentEmails.length > 0) {
    try {
      const { data, error } = await client
        .from("payment_cancelled")
        .select("*")
        .in("email", studentEmails);
      if (!error && data) cancelled = data as Record<string, unknown>[];
    } catch (err) {
      console.warn("[cybercafe] Failed to fetch payment_cancelled:", err);
    }

    try {
      const { data, error } = await client.from("failed_payments").select("*").in("email", studentEmails);
      if (!error && data) failed = data as Record<string, unknown>[];
    } catch (err) {
      console.warn("[cybercafe] Failed to fetch failed_payments:", err);
    }
  }

  // Also filter cancelled/failed by cybercafe_email when column exists
  try {
    const { data } = await client.from("payment_cancelled").select("*").eq("cybercafe_email", cafeEmail);
    if (data?.length) {
      const keys = new Set(cancelled.map((r) => String(r.id || r.payment_id || "")));
      for (const row of data) {
        const k = String(row.id || row.payment_id || "");
        if (!keys.has(k)) cancelled.push(row as Record<string, unknown>);
      }
    }
  } catch {
    /* column may not exist */
  }

  let leadsData: Record<string, unknown>[] = [];
  try {
    const { data, error } = await client
      .from("registration_leads")
      .select("*")
      .eq("cybercafe_email", cafeEmail);
    if (!error && data) leadsData = data as Record<string, unknown>[];
  } catch (err) {
    console.warn("[cybercafe] Failed to fetch registration_leads:", err);
  }

  const leads: CybercafeLeadRow[] = [
    ...cancelled.map((l) => ({ ...l, status_label: "Cancelled" as const })),
    ...failed.map((l) => ({ ...l, status_label: "Failed" as const })),
    ...leadsData.map((l) => ({ ...l, status_label: "Draft" as const })),
  ].sort(
    (a, b) =>
      new Date(String(b.created_at || 0)).getTime() -
      new Date(String(a.created_at || 0)).getTime()
  );

  return {
    applications: applications.map((row) => enrichStudentProfileForDisplay(row) || row),
    leads,
    transactions,
  };
}

export async function fetchCybercafeStudentByEmail(
  client: SupabaseClient,
  studentEmail: string
): Promise<Record<string, unknown> | null> {
  const normalized = studentEmail.trim().toLowerCase();
  if (!normalized.includes("@")) return null;

  try {
    const { data, error } = await client.rpc("cybercafe_get_student_by_email", {
      p_student_email: normalized,
    });
    if (!error && data) {
      const rows = Array.isArray(data) ? data : [data];
      const row = rows[0] as Record<string, unknown> | undefined;
      return row ? enrichStudentProfileForDisplay(row) || row : null;
    }
  } catch (rpcErr) {
    console.warn("[cybercafe] cybercafe_get_student_by_email RPC:", rpcErr);
  }

  const { data, error } = await client
    .from("students")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();
  if (error) throw error;
  return data ? enrichStudentProfileForDisplay(data as Record<string, unknown>) || data : null;
}
