import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { razorpayCreateOrder } from '../_shared/razorpay.ts';
import { getServiceSupabase } from '../_shared/paymentEnrollment.ts';
import { assertStudentRegistrationAvailableServer } from '../_shared/registrationAvailability.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  }

  try {
    const { studentData, amount } = await req.json();
    const parsedAmount = Number(amount);

    if (!studentData || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return jsonResponse({ success: false, message: 'Missing student data or amount' }, 400);
    }

    const { supabaseUrl, supabaseServiceKey } = getServiceSupabase();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const regEmail = String(studentData?.email || '').trim();
    const regPhone = String(
      studentData?.contact_number || studentData?.contact || ''
    ).trim();
    if (regEmail && regPhone) {
      try {
        await assertStudentRegistrationAvailableServer(supabase, regEmail, regPhone);
      } catch (availErr: unknown) {
        const msg =
          availErr instanceof Error ? availErr.message : 'Email or mobile already registered.';
        return jsonResponse({ success: false, message: msg }, 400);
      }
    }

    const { data: config, error: configError } = await supabase
      .from('payment_config')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('id', 1)
      .maybeSingle();

    if (configError) {
      return jsonResponse({ success: false, message: configError.message }, 500);
    }
    if (!config?.razorpay_key_id || !config?.razorpay_key_secret) {
      return jsonResponse(
        { success: false, message: 'Razorpay credentials not found in payment_config' },
        500
      );
    }

    const creds = { keyId: config.razorpay_key_id, keySecret: config.razorpay_key_secret };
    const amountPaise = Math.round(parsedAmount);
    const receipt = `rcpt_${Date.now()}`;

    const order = await razorpayCreateOrder(creds, amountPaise, receipt);

    const { error: insertError } = await supabase.from('payment_orders').insert({
      order_id: order.id,
      user_email: studentData.email,
      user_phone: studentData.contact || studentData.contact_number,
      amount: amountPaise,
      status: 'pending',
      metadata: studentData,
    });

    if (insertError) {
      return jsonResponse({ success: false, message: insertError.message }, 500);
    }

    return jsonResponse({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: config.razorpay_key_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('payment-create-order:', message);
    return jsonResponse({ success: false, message }, 500);
  }
});
