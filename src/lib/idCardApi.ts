import { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

export type IdCardCategory = "student" | "staff" | "cybercafe" | "referral" | "college_admin";

export type IdCardData = {
  id: string;
  cardNumber: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  /** Job title / role shown as Position on the card. */
  position?: string;
  category: IdCardCategory;
  profileImageUrl?: string;
  collegeName?: string;
  course?: string;
  registrationId?: string;
  validUntil?: string;
  joiningDate?: string;
};

export type IdCardRecord = {
  id: string;
  card_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  category: IdCardCategory;
  generated_by: string;
  generated_at: string;
  status: string;
  metadata: any;
};

export const CATEGORY_CODES: Record<IdCardCategory, string> = {
  student: "STD",
  staff: "STF",
  cybercafe: "CBR",
  referral: "RFL",
  college_admin: "CLG",
};

export const CATEGORY_POSITION_DEFAULTS: Record<IdCardCategory, string> = {
  student: "Student Intern",
  staff: "Staff",
  cybercafe: "Cyber Cafe Partner",
  referral: "Referral Partner",
  college_admin: "College Admin",
};

/** Public verify URL encoded in ID-card QR codes. */
import { BRAND_VERIFY_ID_PATH, BRAND_WEBSITE_URL } from "@/lib/brand";

export const ID_CARD_VERIFY_BASE_URL = `${BRAND_WEBSITE_URL}${BRAND_VERIFY_ID_PATH}`;

export function idCardVerifyUrl(cardNumber: string): string {
  const n = (cardNumber || "").trim();
  return `${ID_CARD_VERIFY_BASE_URL}?card=${encodeURIComponent(n)}`;
}

export function resolveIdCardPosition(
  category: IdCardCategory,
  user: {
    position?: string | null;
    role_tag?: string | null;
    course?: string | null;
    internship_domain?: string | null;
  }
): string {
  const explicit = (user.position || user.role_tag || "").trim();
  if (explicit) return explicit;
  const course = (user.course || user.internship_domain || "").trim();
  if (category === "student" && course) return course;
  return CATEGORY_POSITION_DEFAULTS[category];
}

/**
 * Fetch ID card generation history with optional filters.
 */
export async function fetchIdCardHistory(
  supabase: SupabaseClient,
  options?: {
    searchTerm?: string;
    category?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }
) {
  let query = supabase.from("id_card_generations").select("*", { count: "exact" });

  if (options?.searchTerm) {
    const term = `%${options.searchTerm}%`;
    query = query.or(
      `user_name.ilike.${term},user_email.ilike.${term},card_number.ilike.${term}`
    );
  }
  if (options?.category && options.category !== "all") {
    query = query.eq("category", options.category);
  }
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.startDate) {
    query = query.gte("generated_at", `${options.startDate}T00:00:00Z`);
  }
  if (options?.endDate) {
    query = query.lte("generated_at", `${options.endDate}T23:59:59Z`);
  }

  const page = options?.page || 0;
  const pageSize = options?.pageSize || 20;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);
  query = query.order("generated_at", { ascending: false });

  const { data, count, error } = await query;
  if (error) {
    console.error("Error fetching ID card history:", error);
    throw error;
  }
  return { rows: data as IdCardRecord[], total: count || 0 };
}

/**
 * Generate an ID card number by calling the RPC function.
 */
export async function generateIdCardNumber(
  supabase: SupabaseClient,
  category: IdCardCategory
): Promise<string> {
  const code = CATEGORY_CODES[category];
  if (!code) throw new Error("Invalid category for ID Card generation");

  const { data, error } = await supabase.rpc("generate_id_card_number", {
    p_category_code: code,
  });
  
  if (error) {
    console.error("Error generating ID card number via RPC, falling back:", error);
    // Fallback if the RPC is not deployed yet
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `EZI/${code}/${randomNum}`;
  }
  
  return data;
}

/**
 * Save a generated ID card to the database.
 */
export async function saveIdCardRecord(
  supabase: SupabaseClient,
  record: Omit<IdCardRecord, "id" | "generated_at">
) {
  const { data, error } = await supabase
    .from("id_card_generations")
    .insert([record])
    .select()
    .single();

  if (error) {
    console.error("Error saving ID card record:", error);
    throw error;
  }
  
  return data as IdCardRecord;
}

/**
 * Delete an ID card record.
 */
export async function deleteIdCardRecord(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("id_card_generations").delete().eq("id", id);
  if (error) {
    console.error("Error deleting ID card record:", error);
    throw error;
  }
}

/**
 * Fetch users based on the selected category for bulk/list selection.
 */
export async function fetchUsersByCategory(
  supabase: SupabaseClient,
  category: IdCardCategory,
  options?: {
    searchTerm?: string;
  }
) {
  let rows: any[] = [];
  
  try {
    switch (category) {
      case "student": {
        let q = supabase
          .from("students")
          .select(
            "id, full_name, email, phone:contact_number, contact_number, course, internship_domain, college_name, university_name, registration_id, metadata"
          )
          .limit(100);
        if (options?.searchTerm) {
          q = q.or(`full_name.ilike.%${options.searchTerm}%,email.ilike.%${options.searchTerm}%,registration_id.ilike.%${options.searchTerm}%`);
        }
        const { data } = await q;
        rows = (data || []).map((d: any) => {
          let meta: Record<string, unknown> = {};
          try {
            meta =
              typeof d.metadata === "string"
                ? JSON.parse(d.metadata || "{}")
                : d.metadata && typeof d.metadata === "object"
                  ? d.metadata
                  : {};
          } catch {
            meta = {};
          }
          const photo =
            (meta.profile_image_url as string) ||
            (meta.photo_url as string) ||
            (meta.avatar_url as string) ||
            undefined;
          return {
            ...d,
            name: d.full_name,
            phone: d.phone || d.contact_number,
            course: d.course || d.internship_domain,
            position: resolveIdCardPosition("student", {
              course: d.course || d.internship_domain,
              internship_domain: d.internship_domain,
            }),
            college_name: d.college_name || d.university_name,
            profile_image_url: photo,
            registration_id: d.registration_id,
          };
        });
        break;
      }
      case "staff": {
        let q = supabase
          .from("admin_staff")
          .select("id, full_name, email, mobile_number, role_tag, employee_code, profile_image_url")
          .limit(100);
        if (options?.searchTerm) {
          q = q.or(`full_name.ilike.%${options.searchTerm}%,email.ilike.%${options.searchTerm}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        rows = (data || []).map(
          (d: {
            id: string;
            full_name?: string | null;
            email?: string | null;
            mobile_number?: string | null;
            role_tag?: string | null;
            employee_code?: string | null;
            profile_image_url?: string | null;
          }) => ({
            ...d,
            name: d.full_name || d.email || "Staff",
            full_name: d.full_name || d.email || "Staff",
            phone: d.mobile_number || "",
            contact_number: d.mobile_number || "",
            position: resolveIdCardPosition("staff", { role_tag: d.role_tag }),
            registration_id: d.employee_code || undefined,
            profile_image_url: d.profile_image_url || undefined,
          })
        );
        break;
      }
      case "cybercafe": {
        let q = supabase.from("cybercafe_profiles").select("id, shop_name, email, phone").eq("status", "approved").limit(100);
        if (options?.searchTerm) {
          q = q.or(`shop_name.ilike.%${options.searchTerm}%,email.ilike.%${options.searchTerm}%`);
        }
        const { data } = await q;
        rows = (data || []).map((d) => ({
          ...d,
          name: d.shop_name,
          full_name: d.shop_name,
          position: resolveIdCardPosition("cybercafe", {}),
        }));
        break;
      }
      case "referral": {
        let q = supabase
          .from("referral_partners")
          .select("id, full_name, email, contact_number")
          .eq("active", true)
          .limit(100);
        if (options?.searchTerm) {
          q = q.or(`full_name.ilike.%${options.searchTerm}%,email.ilike.%${options.searchTerm}%`);
        }
        const { data } = await q;
        rows = (data || []).map((d) => ({
          ...d,
          name: d.full_name,
          phone: d.contact_number || "",
          position: resolveIdCardPosition("referral", {}),
        }));
        break;
      }
      case "college_admin": {
        // Find users with 'college_admin' role
        const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("role", "college_admin");
        if (roleData && roleData.length > 0) {
          const userIds = roleData.map(r => r.user_id);
          let q = supabase
            .from("profiles")
            .select("id, full_name, email, contact_number")
            .in("id", userIds)
            .limit(100);
          if (options?.searchTerm) {
            q = q.or(`full_name.ilike.%${options.searchTerm}%,email.ilike.%${options.searchTerm}%`);
          }
          const { data } = await q;
          rows = (data || []).map((d) => ({
            ...d,
            name: d.full_name,
            phone: d.contact_number || "",
            position: resolveIdCardPosition("college_admin", {}),
          }));
        }
        break;
      }
    }
  } catch (error) {
    console.error("Error fetching users for category", category, error);
    toast.error("Failed to load users for " + category);
  }
  
  return rows;
}
