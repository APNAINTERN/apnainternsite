import type { SupabaseClient } from "@supabase/supabase-js";

export type CertificateVerifyResult = {
  found: boolean;
  cert: Record<string, unknown> | null;
  student: Record<string, unknown> | null;
  attendanceDays: number;
  bestMarksPercent: number | null;
};

type RpcRow = {
  found?: boolean;
  cert?: Record<string, unknown> | null;
  student?: Record<string, unknown> | null;
  attendance_days?: number | null;
  best_marks_percent?: number | null;
};

export async function verifyCertificatePublic(
  client: SupabaseClient,
  opts: {
    query?: string;
    studentName?: string;
    rollNumber?: string;
  }
): Promise<CertificateVerifyResult> {
  const { data, error } = await client.rpc("verify_certificate_public", {
    p_query: opts.query?.trim() || null,
    p_student_name: opts.studentName?.trim() || null,
    p_roll_number: opts.rollNumber?.trim() || null,
  });

  if (error) throw error;

  const row = (data ?? { found: false }) as RpcRow;
  if (!row.found) {
    return {
      found: false,
      cert: null,
      student: null,
      attendanceDays: 0,
      bestMarksPercent: null,
    };
  }

  const student = row.student ?? null;

  return {
    found: true,
    cert: row.cert ?? null,
    student,
    attendanceDays: Number(row.attendance_days) || 0,
    bestMarksPercent:
      row.best_marks_percent != null && Number.isFinite(Number(row.best_marks_percent))
        ? Number(row.best_marks_percent)
        : null,
  };
}
