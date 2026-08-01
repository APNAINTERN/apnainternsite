/**
 * Server-side payment amount validation (prevents client tampering).
 */
import type { ServerDb } from "./getServerDb";
import { resolveStudentFeeBreakdown } from "../../src/lib/collegeFees";

const SKIP_PURPOSES = new Set(["course_purchase", "internship_upgrade"]);

export async function assertOrderAmountValid(
  db: ServerDb,
  amountPaise: number,
  studentData: Record<string, unknown>
): Promise<void> {
  const parsed = Math.round(Number(amountPaise));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid payment amount");
  }

  const purpose = String(studentData.purpose || "").trim().toLowerCase();
  if (SKIP_PURPOSES.has(purpose)) return;

  const source = String(studentData.source || "").trim().toLowerCase();
  if (source.includes("unpaid_student") || source.includes("course_")) return;

  const collegeId = String(studentData.collegeId || studentData.college_id || "").trim();
  const universityId = String(studentData.universityId || studentData.university_id || "").trim();

  let college: Record<string, unknown> | null = null;
  let university: Record<string, unknown> | null = null;

  if (collegeId) {
    const { data } = await db.from("colleges").select("*").eq("id", collegeId).maybeSingle();
    college = (data as Record<string, unknown>) || null;
  }

  if (universityId) {
    const { data } = await db.from("universities").select("*").eq("id", universityId).maybeSingle();
    university = (data as Record<string, unknown>) || null;
  } else if (college?.university_id) {
    const { data } = await db
      .from("universities")
      .select("*")
      .eq("id", String(college.university_id))
      .maybeSingle();
    university = (data as Record<string, unknown>) || null;
  }

  const { data: payCfg } = await db
    .from("payment_config")
    .select("amount_paise")
    .eq("id", 1)
    .maybeSingle();

  const breakdown = resolveStudentFeeBreakdown(
    String(university?.name || studentData.university || ""),
    String(college?.name || studentData.college || studentData.collegeName || ""),
    college as Parameters<typeof resolveStudentFeeBreakdown>[2],
    university as Parameters<typeof resolveStudentFeeBreakdown>[3],
    Number((payCfg as { amount_paise?: number } | null)?.amount_paise) || null
  );

  const expected = breakdown.totalPaise;
  if (Math.abs(parsed - expected) > 1) {
    throw new Error(
      `Payment amount mismatch. Expected ₹${(expected / 100).toFixed(2)}, received ₹${(parsed / 100).toFixed(2)}.`
    );
  }
}
