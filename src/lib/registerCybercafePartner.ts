import type { SupabaseClient } from "@supabase/supabase-js";
import { createEphemeralSupabaseAuthClient } from "@/lib/createSubUser";
import {
  REGISTRATION_PASSWORD_MIN_LENGTH,
  signUpStudentWithChosenPassword,
} from "@/lib/registrationPassword";
import { signInStudentWithPassword } from "@/lib/studentAuthLogin";

export type CybercafePartnerRegistrationInput = {
  owner_name: string;
  email: string;
  password: string;
  shop_name: string;
  location: string;
  phone: string;
};

function friendlyCybercafePartnerError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  const low = msg.toLowerCase();
  if (low.includes("register_cybercafe_partner") && low.includes("could not find")) {
    return "Partner registration is not set up on the database yet. Run supabase/hotfix_cybercafe_partner_registration.sql in Supabase SQL.";
  }
  if (low.includes("sign in required")) {
    return "Could not finish registration. Turn off email confirmation in Supabase Auth, or confirm your email, then try again.";
  }
  if (low.includes("already registered") || low.includes("already exists") || low.includes("duplicate")) {
    return "This email is already registered. Use Cyber Cafe Login if you have an account.";
  }
  if (msg.trim()) return msg;
  return "Partner registration failed. Please try again or contact support.";
}

/**
 * Self-service cyber cafe partner signup (public landing page).
 * Uses an ephemeral auth client so an existing browser session is not overwritten.
 */
export async function registerCybercafePartner(
  directoryClient: SupabaseClient,
  input: CybercafePartnerRegistrationInput
): Promise<{ userId: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const password = input.password.trim();
  if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
  }

  const authClient = createEphemeralSupabaseAuthClient();
  const { userId } = await signUpStudentWithChosenPassword(authClient, directoryClient, {
    email: normalizedEmail,
    password,
    fullName: input.owner_name.trim(),
  });

  const signIn = await signInStudentWithPassword(authClient, normalizedEmail, password);
  if (!signIn.ok) {
    throw new Error(
      signIn.error instanceof Error
        ? signIn.error.message
        : "Account was created but sign-in failed. Try logging in from the Cyber Cafe login page."
    );
  }

  const { data, error } = await authClient.rpc("register_cybercafe_partner", {
    p_user_id: userId,
    p_owner_name: input.owner_name.trim(),
    p_email: normalizedEmail,
    p_phone: input.phone.trim(),
    p_shop_name: input.shop_name.trim(),
    p_location: input.location.trim(),
  });

  if (error) {
    throw new Error(friendlyCybercafePartnerError(error));
  }
  if (data && typeof data === "object" && (data as { ok?: boolean }).ok !== true) {
    throw new Error("Partner profile could not be saved.");
  }

  return { userId };
}
