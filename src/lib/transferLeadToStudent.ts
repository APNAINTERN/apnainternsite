import type { SupabaseClient } from "@supabase/supabase-js";
import { adminUpsertStudentProfile } from "@/lib/adminProfileUpsert";
import { createEphemeralSupabaseAuthClient } from "@/lib/createSubUser";
import {
  buildLeadTransferProfileRow,
  buildLeadTransferStudentPayload,
  mergeLeadFieldSources,
  pickLeadString,
} from "@/lib/leadTransferPayload";
import { completeStudentDirectoryRegistration } from "@/lib/registerStudentDirectory";
import { signUpStudentWithChosenPassword } from "@/lib/registrationPassword";
import { allocateNextRegistrationId, bumpRegistrationId } from "@/lib/registrationId";
import { getSendMailApiUrl } from "@/lib/sendMailApi";
import { markLeadCrmConvertedByEmail } from "@/lib/leadAssignment";

export type LeadTransferInput = {
  directoryClient: SupabaseClient;
  lead: Record<string, unknown>;
  password: string;
  /** Prefix for synthetic payment_success.payment_id (e.g. ADMIN_TRANS_). */
  paymentIdPrefix?: string;
};

function isRegistrationIdCollision(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string };
  const blob = `${e.code || ""} ${e.message || ""} ${e.details || ""}`.toLowerCase();
  return e.code === "23505" && blob.includes("registration_id");
}

/** Resolve a real auth.users id (retries briefly after signUp). */
export async function ensureAuthUserIdForEmail(
  client: SupabaseClient,
  email: string,
  hintId?: string
): Promise<string> {
  const normalized = email.trim().toLowerCase();

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: rpcId, error: rpcErr } = await client.rpc("get_user_id_by_email", {
      email_text: normalized,
    });
    if (!rpcErr && rpcId) {
      return String(rpcId);
    }

    const { data: prof } = await client
      .from("profiles")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (prof?.id) {
      return prof.id;
    }

    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 300 + attempt * 200));
    }
  }

  if (hintId) {
    const { data: rpcId } = await client.rpc("get_user_id_by_email", {
      email_text: normalized,
    });
    if (rpcId && String(rpcId) === hintId) {
      return hintId;
    }
  }

  throw new Error(
    "Auth account was not found after signup. In Supabase Auth, disable “Confirm email” for new signups, or confirm the account, then retry."
  );
}

/**
 * Lead Hub → Students Directory: create/link auth user, profile, then full student row via RPC.
 */
export async function transferLeadToStudentDirectory(
  input: LeadTransferInput
): Promise<{ userId: string; registrationId: string }> {
  const { directoryClient, lead, password, paymentIdPrefix = "ADMIN_TRANS_" } = input;

  const merged = mergeLeadFieldSources(lead);
  const leadEmail = pickLeadString(lead.email, lead.user_email, merged.email);
  if (!leadEmail) {
    throw new Error("Lead has no email address.");
  }
  const normalizedEmail = leadEmail.toLowerCase();
  const leadName = pickLeadString(
    lead.full_name,
    merged.fullName,
    merged.full_name,
    leadEmail
  );

  const transferClient = createEphemeralSupabaseAuthClient();
  const { userId: signUpId } = await signUpStudentWithChosenPassword(transferClient, directoryClient, {
    email: normalizedEmail,
    password,
    fullName: leadName,
  });

  const userId = await ensureAuthUserIdForEmail(directoryClient, normalizedEmail, signUpId);

  const profileRow = buildLeadTransferProfileRow({
    id: userId,
    full_name: leadName,
    email: normalizedEmail,
    contact_number: pickLeadString(
      lead.user_phone,
      lead.contact_number,
      lead.phone,
      merged.contact,
      merged.contact_number
    ),
    gender: pickLeadString(lead.gender, merged.gender) || null,
    parent_name: pickLeadString(lead.parent_name, merged.parentName, merged.parent_name) || null,
  });

  await adminUpsertStudentProfile(directoryClient, {
    id: userId,
    full_name: String(profileRow.full_name || leadName),
    email: normalizedEmail,
    contact_number: String(profileRow.contact_number || ""),
    gender: (profileRow.gender as string) || null,
    parent_name: (profileRow.parent_name as string) || null,
  });

  let regId = await allocateNextRegistrationId(directoryClient);
  let retryCount = 0;

  while (retryCount < 10) {
    const studentRow = buildLeadTransferStudentPayload({
      userId,
      normalizedEmail,
      lead,
      password,
      registrationId: regId,
    });

    try {
      await completeStudentDirectoryRegistration({
        client: directoryClient,
        studentRow,
        profileRow,
      });
      break;
    } catch (err) {
      if (isRegistrationIdCollision(err)) {
        regId = bumpRegistrationId(regId);
        retryCount++;
        continue;
      }
      const msg = String((err as { message?: string })?.message || "");
      if (msg.includes("students_id_fkey") || msg.includes("violates foreign key")) {
        throw new Error(
          "Could not link student record to auth account. Confirm the email is not already registered under another id, then retry."
        );
      }
      if (/registration window expired/i.test(msg)) {
        throw new Error(
          "Lead transfer blocked by registration time limit. Run supabase/hotfix_lead_transfer_student_directory.sql in Supabase SQL Editor, then retry."
        );
      }
      if (/access denied/i.test(msg)) {
        throw new Error(
          "Lead transfer denied. Sign in as admin or staff, then retry. If this persists, run supabase/hotfix_lead_transfer_student_directory.sql in Supabase."
        );
      }
      throw err;
    }
  }

  if (retryCount >= 10) {
    throw new Error("Could not allocate a unique registration ID. Try again.");
  }

  await directoryClient
    .from("user_roles")
    .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });

  const collegeName = pickLeadString(
    lead.college_name,
    merged.college,
    merged.college_name
  );
  const { error: paymentError } = await directoryClient.from("payment_success").insert({
    user_id: userId,
    payment_id: `${paymentIdPrefix}${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    amount_paise: Number(lead.amount_paise || lead.amount || 9900),
    email: normalizedEmail,
    full_name: leadName,
    college_name: collegeName || null,
    cybercafe_shop_name: pickLeadString(lead.cybercafe_shop_name, merged.cybercafe_shop_name) || null,
    cybercafe_email: pickLeadString(lead.cybercafe_email, merged.cybercafe_email) || null,
    status: "success",
  });
  if (paymentError) {
    console.error("Payment log error:", paymentError);
    throw new Error("Failed to record payment transaction");
  }

  try {
    await fetch(getSendMailApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "registration_success",
        data: {
          fullName: leadName,
          email: normalizedEmail,
          registrationId: regId,
          password,
          loginLink: "https://ezyintern.in/login?portal=student",
        },
      }),
    });
  } catch (e) {
    console.warn("Failed to send registration email:", e);
  }

  await markLeadCrmConvertedByEmail(
    directoryClient,
    normalizedEmail,
    "Auto-converted: lead transferred to registration"
  );

  return { userId, registrationId: regId };
}
