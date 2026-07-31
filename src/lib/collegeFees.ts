import {
  computeFeeBreakdown,
  type CollegeFeeFields,
  type FeeBreakdown,
} from "@/lib/feeRules";

export type { CollegeFeeFields, FeeBreakdown };

export type CollegeWithFees = CollegeFeeFields & {
  id: string;
  name: string;
  university_id: string;
  pisa_fee?: number | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  universities?: { name: string } | null;
};

/** Default flat total when a college is selected but has no stored fee (Fees Management fallback). */
export const DEFAULT_COLLEGE_FEE_PAISE = 50000;

/**
 * Default Eng. Management college fee: ₹500 registration + ₹49 processing = ₹549.
 * Applied on college create/sync from Engineering Management.
 */
export const DEFAULT_ENGINEERING_COLLEGE_FEE = {
  totalRupees: 549,
  baseRupees: 500,
  processingRupees: 49,
  showBreakdown: true,
} as const;

export function defaultEngineeringCollegeFeePayload() {
  return buildCollegeFeeUpdatePayload({ ...DEFAULT_ENGINEERING_COLLEGE_FEE });
}

/** Resolve fallback amount before rules/DB (college → university → payment config). */
export function resolveBaseAmountPaise(
  college: { pisa_fee?: number | null } | null | undefined,
  university: { pisa_fee?: number | null } | null | undefined,
  paymentConfigAmount?: number | null
): number {
  if (college?.pisa_fee && college.pisa_fee > 0) return college.pisa_fee;
  if (university?.pisa_fee && university.pisa_fee > 0) return university.pisa_fee;
  // When a college is selected, match Fees Management (₹500 default) — do not use
  // global payment_config.amount_paise (often a stale/test value like ₹2).
  if (college != null) return DEFAULT_COLLEGE_FEE_PAISE;
  if (paymentConfigAmount && paymentConfigAmount > 0) return paymentConfigAmount;
  return DEFAULT_COLLEGE_FEE_PAISE;
}

export function resolveStudentFeeBreakdown(
  universityName: string | undefined | null,
  collegeName: string | undefined | null,
  college: CollegeFeeFields | null | undefined,
  university: { pisa_fee?: number | null } | null | undefined,
  paymentConfigAmount?: number | null
): FeeBreakdown {
  const fallback = resolveBaseAmountPaise(college ?? undefined, university, paymentConfigAmount);
  return computeFeeBreakdown(universityName, collegeName, fallback, college);
}

export function buildCollegeFeeUpdatePayload(input: {
  totalRupees: number;
  baseRupees: number;
  processingRupees: number;
  showBreakdown: boolean;
}) {
  const totalPaise = Math.round(input.totalRupees * 100);
  const processingPaise = input.showBreakdown
    ? Math.round(input.processingRupees * 100)
    : 0;
  const basePaise = input.showBreakdown
    ? Math.round(input.baseRupees * 100)
    : totalPaise;

  return {
    pisa_fee: totalPaise,
    fee_base_paise: basePaise,
    fee_processing_paise: processingPaise,
    show_fee_breakdown: input.showBreakdown,
    fees_managed: true,
  };
}
