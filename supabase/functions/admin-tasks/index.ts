import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import {
  connectSmtpClient,
  getSmtpCredentials,
  resolveMailFrom,
} from "../_shared/smtpConfig.ts";
import { nextRegistrationIdFromRows } from "../_shared/registrationId.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify the requester is an admin
    const authHeader = req.headers.get("Authorization")?.split(" ")[1];
    if (!authHeader) {
      throw new Error("No auth token provided");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error("Invalid token");
    }

    // Check role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = roles?.some(r => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    // 2. Parse request body
    const body = await req.json();
    const { action, leadId } = body;

    if (action === "transfer_lead") {
      // Get lead data
      const { data: lead, error: leadError } = await supabase
        .from("payment_cancelled")
        .select("*")
        .eq("id", leadId)
        .single();
      
      if (leadError || !lead) throw new Error("Lead not found");

      const metadata = lead.metadata || {};
      const email = lead.user_email;
      const password = metadata.password;

      if (!password) {
        throw new Error("Lead metadata is missing password. Cannot transfer.");
      }

      // Create Auth User
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: metadata.fullName }
      });

      if (createError) throw createError;

      // Assign student role
      await supabase.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "student"
      });

      // Generate Registration ID
      const { data: recentStudents } = await supabase
        .from("students")
        .select("registration_id")
        .not("registration_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      const regId = nextRegistrationIdFromRows(
        recentStudents ?? [],
        new Date().getFullYear()
      );

      // Create Student Record
      const { error: studentError } = await supabase.from("students").insert({
        id: newUser.user.id,
        email: email,
        full_name: metadata.fullName,
        gender: metadata.gender,
        parent_name: metadata.parentName,
        contact_number: lead.user_phone,
        university_name: metadata.university,
        college_name: metadata.college,
        course: metadata.course,
        internship_domain: metadata.course,
        degree: metadata.degree,
        department: metadata.department,
        class_semester: metadata.semester,
        academic_session: metadata.session,
        roll_number: metadata.rollNo,
        emergency_name: metadata.emName,
        emergency_contact: metadata.emPhone,
        emergency_relation: metadata.emRel,
        status: 'Active',
        registration_id: regId,
        metadata: { subject: metadata.subject }
      });

      if (studentError) throw studentError;

      // Also update profiles
      await supabase.from("profiles").upsert({
        id: newUser.user.id,
        full_name: metadata.fullName,
        email: email,
        contact_number: lead.user_phone,
        gender: metadata.gender,
        parent_name: metadata.parentName
      });

      // Delete Lead
      await supabase.from("payment_cancelled").delete().eq("id", leadId);

      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "create_sub_user") {
      const { email, password, roleTag, permissions } = body;

      if (!email || !password || !roleTag) {
        throw new Error("Missing required fields: email, password, roleTag");
      }

      // 1. Create Auth User
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: roleTag }
      });

      if (createError) throw createError;

      const userId = newUser.user.id;

      // 2. Assign admin role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "admin"
      });

      if (roleError) throw roleError;

      // 3. Create Profile
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        full_name: roleTag,
        email: email,
      });

      if (profileError) throw profileError;

      // 4. Set Permissions
      const { error: permError } = await supabase.from("admin_permissions").insert({
        user_id: userId,
        ...permissions
      });

      if (permError) throw permError;

      return new Response(JSON.stringify({ success: true, userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "fetch_razorpay_payment") {
      const { query } = body;
      if (!query) throw new Error("Missing query");

      const rzpKeyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
      const rzpKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
      const rzpAuth = `Basic ${btoa(`${rzpKeyId}:${rzpKeySecret}`)}`;
      
      let matchedPayment = null;
      
      if (query.startsWith("pay_")) {
        const res = await fetch(`https://api.razorpay.com/v1/payments/${query}`, {
          headers: { Authorization: rzpAuth }
        });
        if (res.ok) {
          const data = await res.json();
          matchedPayment = data;
        }
      } else {
        const res = await fetch(`https://api.razorpay.com/v1/payments?count=100`, {
          headers: { Authorization: rzpAuth }
        });
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          matchedPayment = items.find((p: any) => p.email && p.email.toLowerCase() === query.toLowerCase());
        }
      }
      
      if (!matchedPayment) {
        throw new Error("Payment not found. Ensure the Email is correct or try the exact Payment ID (pay_...).");
      }
      
      const { data: existingStudent } = await supabase.from("students").select("id").eq("email", matchedPayment.email.toLowerCase()).maybeSingle();
      
      return new Response(JSON.stringify({ 
        success: true, 
        payment: matchedPayment,
        isRegistered: !!existingStudent
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "recover_payment_and_create_student") {
      const { paymentDetails, password } = body;
      const { name, email, amount, paymentId, contact } = paymentDetails;
      
      if (!email || !paymentId || !amount) throw new Error("Missing payment details");
      
      const emailLower = email.toLowerCase();
      
      let authUserId = null;
      let isNewUser = false;
      const { data: existingStudent } = await supabase.from("students").select("id").eq("email", emailLower).maybeSingle();
      
      if (existingStudent) {
        authUserId = existingStudent.id;
      } else {
        if (!password) throw new Error("Password is required to create a new user account.");
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: emailLower,
          password: password,
          email_confirm: true,
          user_metadata: { full_name: name }
        });
        if (createError) throw createError;
        authUserId = newUser.user.id;
        isNewUser = true;
        
        await supabase.from("user_roles").insert({ user_id: authUserId, role: "student" });
        
        const { data: recentStudents } = await supabase
          .from("students")
          .select("registration_id")
          .not("registration_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(50);

        const regId = nextRegistrationIdFromRows(
          recentStudents ?? [],
          new Date().getFullYear()
        );
        
        await supabase.from("students").insert({
          id: authUserId,
          email: emailLower,
          full_name: name,
          contact_number: contact,
          status: 'Active',
          registration_id: regId,
        });
        
        await supabase.from("profiles").upsert({
          id: authUserId,
          full_name: name,
          email: emailLower,
          contact_number: contact,
        });
      }
      
      const { error: paymentError } = await supabase.from("payment_success").upsert({
        payment_id: paymentId,
        user_id: authUserId,
        email: emailLower,
        amount_paise: amount * 100,
        status: "success",
        full_name: name
      }, { onConflict: "payment_id" });
      if (paymentError) throw paymentError;
      
      await supabase.from("payment_cancelled").delete().eq("user_email", emailLower);
      await supabase.from("registration_leads").delete().eq("email", emailLower);
      
      if (isNewUser) {
        const { pass: SMTP_PASS } = getSmtpCredentials();
        if (SMTP_PASS) {
          try {
            const client = new SmtpClient();
            await connectSmtpClient(client);
            await client.send({
              from: resolveMailFrom(),
              to: emailLower,
              subject: "Welcome to Apna Intern - Registration Successful",
              html: `
                <div style="font-family: sans-serif; padding: 24px; border: 2px solid #4F46E5; border-radius: 16px;">
                  <h2 style="color: #4F46E5;">Welcome to Apna Intern, ${name}!</h2>
                  <p>Your payment has been successfully verified and your account has been created by our staff team.</p>
                  <p><strong>Login Email:</strong> ${emailLower}</p>
                  <p><strong>Password:</strong> ${password}</p>
                  <p>Please log in to your dashboard and complete your profile.</p>
                </div>
              `,
            });
            await client.close();
          } catch(e) { console.error("SMTP error", e); }
        }
      }
      
      return new Response(JSON.stringify({ success: true, userId: authUserId, isNewUser }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "test_mail") {
      const { to, subject, message } = body;
      
      const { pass: SMTP_PASS } = getSmtpCredentials();
      if (!SMTP_PASS) {
        return new Response(JSON.stringify({ error: "SMTP credentials missing" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const client = new SmtpClient();
      await connectSmtpClient(client);

      await client.send({
        from: resolveMailFrom("Apna Intern Admin Test"),
        to: to,
        subject: `[ADMIN TEST] ${subject}`,
        html: `
          <div style="font-family: sans-serif; padding: 24px; border: 2px solid #4F46E5; border-radius: 16px;">
            <h2 style="color: #4F46E5; margin-top: 0;">Admin task: mail diagnostic</h2>
            <p>This test email was routed through the <strong>admin-tasks</strong> edge function.</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #4F46E5;">
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap; color: #1e293b;">${message}</p>
            </div>
            <p style="font-size: 11px; color: #94a3b8;">Sent by: ${user.email} | Time: ${new Date().toLocaleString()}</p>
          </div>
        `,
      });

      await client.close();

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
