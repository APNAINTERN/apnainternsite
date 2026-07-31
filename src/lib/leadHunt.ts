import { parseJsonField } from "@/lib/parseJsonField";

export type LeadSourceType = "registration_lead" | "payment_cancelled" | "payment_success";

export type LeadHuntRow = {
  id: string;
  created_at: string;
  email: string;
  full_name: string;
  contact_number?: string | null;
  university_name: string;
  college_name: string;
  course: string;
  amount_paise: number;
  failure_reason: string;
  payment_id: string | null;
  source_type: LeadSourceType;
  source_id: string;
  state?: string;
  city?: string;
  lead_source?: string;
  original: Record<string, unknown>;
};

type DraftLead = {
  id: string;
  email?: string | null;
  phone?: string | null;
  updated_at: string;
  payload?: Record<string, unknown> | null;
  cybercafe_shop_name?: string | null;
  cybercafe_email?: string | null;
};

type PayLead = Record<string, unknown>;

function normName(value: unknown): string {
  return String(value || "").trim();
}

function namesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function metaPlace(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = normName(meta[k]);
    if (v) return v;
  }
  return "";
}

export function resolveLeadSourceFromHuntId(
  huntId: string,
  original?: Record<string, unknown>
): { source_type: LeadSourceType; source_id: string } | null {
  if (huntId.startsWith("reg-draft-")) {
    const source_id = String(original?.draft_id || huntId.replace(/^reg-draft-/, ""));
    return { source_type: "registration_lead", source_id };
  }
  const marked = original?._lead_source_type as LeadSourceType | undefined;
  if (marked === "payment_cancelled" || marked === "payment_success" || marked === "registration_lead") {
    return { source_type: marked, source_id: String(original?.id || huntId) };
  }
  if (original?.registration_draft) {
    return { source_type: "registration_lead", source_id: String(original.draft_id || huntId) };
  }
  return { source_type: "payment_success", source_id: huntId };
}

export function buildLeadHuntRows(params: {
  registrationDraftLeads: DraftLead[];
  failedPayments: PayLead[];
  cancelledPayments: PayLead[];
  enrolledEmails: Set<string>;
  searchTerm?: string;
  uniFilter?: string;
  collegeFilter?: string;
}): LeadHuntRow[] {
  const { registrationDraftLeads, failedPayments, cancelledPayments, enrolledEmails } = params;
  const search = params.searchTerm?.trim().toLowerCase() ?? "";
  const uniFilter = params.uniFilter && params.uniFilter !== "all" ? params.uniFilter.trim() : "";
  const collegeFilter =
    params.collegeFilter && params.collegeFilter !== "all" ? params.collegeFilter.trim() : "";

  const draftRows: LeadHuntRow[] = registrationDraftLeads
    .map((d) => {
      const pl = parseJsonField(d.payload);
      const email = String(d.email || pl.email || "")
        .trim()
        .toLowerCase();
      if (!email) return null;
      if (enrolledEmails.has(email)) return null;

      const universityName = normName(pl.university || pl.university_name || d.payload?.university);
      const collegeName = normName(pl.college || pl.college_name);
      const meta = {
        ...pl,
        fullName: pl.fullName,
        parentName: pl.parentName,
        gender: pl.gender,
        contact: pl.contact,
        university: pl.university || universityName,
        college: pl.college || collegeName,
        degree: pl.degree,
        department: pl.department,
        session: pl.session,
        semester: pl.semester,
        rollNo: pl.rollNo,
        course: pl.course,
      };
      const state = metaPlace(pl, "state", "State");
      const city = metaPlace(pl, "city", "City", "district");
      const leadSource = d.cybercafe_shop_name
        ? `CyberCafe: ${d.cybercafe_shop_name}`
        : metaPlace(pl, "source", "lead_source") || "Registration draft";
      return {
        id: `reg-draft-${d.id}`,
        created_at: d.updated_at,
        email,
        full_name: String(pl.fullName || d.email || email),
        contact_number: (pl.contact as string) || d.phone,
        university_name: universityName || "—",
        college_name: collegeName || "—",
        course: String(pl.course || "—"),
        amount_paise: 0,
        failure_reason: "Incomplete registration",
        payment_id: null,
        source_type: "registration_lead" as const,
        source_id: d.id,
        state,
        city,
        lead_source: leadSource,
        original: {
          registration_draft: true,
          draft_id: d.id,
          _lead_source_type: "registration_lead",
          user_email: email,
          user_phone: pl.contact || d.phone,
          contact_number: pl.contact || d.phone,
          full_name: pl.fullName,
          gender: pl.gender,
          parent_name: pl.parentName,
          college_name: collegeName,
          university_name: universityName,
          degree: pl.degree,
          department: pl.department,
          class_semester: pl.semester,
          academic_session: pl.session,
          roll_number: pl.rollNo,
          emergency_name: pl.emName,
          emergency_contact: pl.emPhone,
          emergency_relation: pl.emRel,
          course: pl.course,
          payload: pl,
          metadata: meta,
          cybercafe_shop_name: d.cybercafe_shop_name,
          cybercafe_email: d.cybercafe_email,
        },
      } satisfies LeadHuntRow;
    })
    .filter((row): row is LeadHuntRow => row != null);

  const mapPay = (cp: PayLead, source_type: "payment_cancelled" | "payment_success"): LeadHuntRow => {
    const metadata = parseJsonField(cp.metadata);
    const universityName = normName(
      cp.university_name || metadata.university || metadata.university_name
    );
    const collegeName = normName(cp.college_name || metadata.college || metadata.college_name);
    const state = metaPlace(metadata, "state", "State");
    const city = metaPlace(metadata, "city", "City", "district");
    const shop = String(cp.cybercafe_shop_name || metadata.cybercafe_shop_name || "").trim();
    const leadSource = shop
      ? `CyberCafe: ${shop}`
      : source_type === "payment_cancelled"
        ? "Payment cancelled"
        : "Payment failed";
    return {
      id: String(cp.id),
      created_at: String(cp.created_at),
      email: String(cp.email || cp.user_email || "")
        .trim()
        .toLowerCase(),
      full_name: String(cp.full_name || metadata.fullName || cp.user_email || cp.email || ""),
      contact_number:
        (cp.contact_number as string) ||
        (cp.user_phone as string) ||
        (metadata.contact as string),
      university_name: universityName || "—",
      college_name: collegeName || "No College",
      course: String(metadata.course || "No Domain"),
      amount_paise: Number(cp.amount_paise || cp.amount || 0),
      failure_reason: String(cp.failure_reason || cp.reason || "Payment Failed"),
      payment_id: (cp.payment_id as string) || null,
      source_type,
      source_id: String(cp.id),
      state,
      city,
      lead_source: leadSource,
      original: { ...cp, _lead_source_type: source_type },
    };
  };

  const payRows: LeadHuntRow[] = [
    ...failedPayments.map((cp) => mapPay(cp, "payment_success")),
    ...cancelledPayments.map((cp) => mapPay(cp, "payment_cancelled")),
  ];

  const merged = [...draftRows, ...payRows]
    .filter((cp) => {
      if (cp.email && enrolledEmails.has(cp.email.toLowerCase())) return false;
      if (uniFilter && !namesMatch(cp.university_name, uniFilter)) return false;
      if (collegeFilter && !namesMatch(cp.college_name, collegeFilter)) return false;
      if (!search) return true;
      return (
        cp.email?.toLowerCase().includes(search) ||
        cp.full_name?.toLowerCase().includes(search) ||
        String(cp.contact_number || "").toLowerCase().includes(search) ||
        cp.college_name?.toLowerCase().includes(search) ||
        cp.university_name?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return merged;
}
