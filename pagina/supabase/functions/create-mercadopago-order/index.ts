import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responseJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function amountOf(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return rounded >= 0.01 && rounded <= 10000000 ? rounded : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return responseJson({ error: 'Método no permitido.' }, 405);

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!accessToken || !supabaseUrl || !serviceRoleKey) return responseJson({ error: 'Pagos no configurados.' }, 500);

  const body = await req.json().catch(() => ({}));
  const amount = amountOf(body.amount);
  const token = String(body.token ?? '').trim();
  const paymentMethodId = String(body.payment_method_id ?? '').trim();
  const paymentTypeId = String(body.payment_type_id ?? '').trim();
  const externalReference = String(body.external_reference ?? '').trim();
  const installments = Number(body.installments ?? 1);

  if (!amount || !token || !paymentMethodId || !externalReference) {
    return responseJson({ error: 'Faltan datos obligatorios.' }, 400);
  }
  if (!/^donation-[0-9a-f-]{20,}$/i.test(externalReference)) {
    return responseJson({ error: 'Referencia inválida.' }, 400);
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > 99) {
    return responseJson({ error: 'Cuotas inválidas.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  let userId: string | null = null;
  let authenticatedEmail: string | null = null;

  const authorization = req.headers.get('Authorization');
  if (authorization?.startsWith('Bearer ') && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data } = await userClient.auth.getUser();
    if (data.user) {
      userId = data.user.id;
      authenticatedEmail = data.user.email ?? null;
    }
  }

  const payer = body.payer ?? {};
  const payerEmail = String(payer.email ?? '').trim() || authenticatedEmail;
  if (!payerEmail) return responseJson({ error: 'El correo del pagador es obligatorio.' }, 400);

  const { data: existing, error: lookupError } = await admin
    .from('donations')
    .select('id,status,payment_id,payment_status_detail')
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (lookupError) return responseJson({ error: 'No se pudo preparar la donación.' }, 500);
  if (existing?.payment_id) {
    return responseJson({
      status: existing.status,
      status_detail: existing.payment_status_detail,
      donation_id: existing.id,
      payment_id: existing.payment_id,
    });
  }

  let donationId = existing?.id ?? null;
  if (!donationId) {
    const { data: donation, error } = await admin.from('donations').insert({
      user_id: userId,
      amount_mxn: amount,
      currency: 'MXN',
      status: 'created',
      external_reference: externalReference,
      payer_email: payerEmail,
    }).select('id').single();

    if (error) return responseJson({ error: 'No se pudo registrar la donación.' }, 500);
    donationId = donation.id;
  }

  const orderPayload = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: amount.toFixed(2),
    external_reference: externalReference,
    transactions: {
      payments: [{
        amount: amount.toFixed(2),
        payment_method: {
          id: paymentMethodId,
          type: paymentTypeId || 'credit_card',
          token,
          installments,
        },
        payer: {
          email: payerEmail,
          ...(payer.identification ? { identification: payer.identification } : {}),
        },
      }],
    },
  };

  const orderResponse = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': externalReference,
    },
    body: JSON.stringify(orderPayload),
  });

  const order = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) {
    await admin.from('donations').update({
      status: 'rejected',
      payment_status_detail: order?.message ?? order?.error ?? 'order_creation_failed',
      raw_payment: order,
      updated_at: new Date().toISOString(),
    }).eq('id', donationId);
    return responseJson({
      error: order?.message ?? order?.error ?? 'Mercado Pago rechazó la orden.',
      details: order?.cause ?? null,
    }, 502);
  }

  const payment = order?.transactions?.payments?.[0] ?? {};
  await admin.from('donations').update({
    order_id: order?.id ? String(order.id) : null,
    payment_id: payment?.id ? String(payment.id) : null,
    status: payment?.status ?? order?.status ?? 'created',
    payment_status_detail: payment?.status_detail ?? order?.status_detail ?? null,
    payment_type: payment?.payment_method?.type ?? payment?.payment_type_id ?? paymentMethodId,
    payer_email: payerEmail,
    raw_payment: order,
    updated_at: new Date().toISOString(),
  }).eq('id', donationId);

  return responseJson({
    status: payment?.status ?? order?.status ?? 'created',
    status_detail: payment?.status_detail ?? order?.status_detail ?? null,
    donation_id: donationId,
    order_id: order?.id ? String(order.id) : null,
    payment_id: payment?.id ? String(payment.id) : null,
  });
});