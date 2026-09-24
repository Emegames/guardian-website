import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 10_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function validAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT;
}

function uuid() {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!accessToken || !supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Falta configurar Mercado Pago o Supabase en las variables de entorno.' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const donationId = String(body.donation_id ?? '');
  if (!donationId) return json({ error: 'Falta el identificador de la donación.' }, 400);

  const formData = (body.formData && typeof body.formData === 'object') ? body.formData as Record<string, unknown> : {};
  const token = String(formData.token ?? '');
  const paymentMethodId = String(formData.payment_method_id ?? formData.paymentMethodId ?? '');
  const installments = Number(formData.installments ?? 1);
  const transactionAmount = Number(formData.transaction_amount ?? formData.transactionAmount ?? body.amount);
  const email = String(formData.payer?.email ?? formData.cardholderEmail ?? body.email ?? '');
  const identificationType = String(formData.payer?.identification?.type ?? formData.identificationType ?? '');
  const identificationNumber = String(formData.payer?.identification?.number ?? formData.identificationNumber ?? '');
  const cardholderName = String(formData.payer?.first_name ?? formData.cardholderName ?? '');

  if (!token || !paymentMethodId || !Number.isInteger(installments) || installments < 1 || !email) {
    return json({ error: 'Faltan datos requeridos para procesar el pago.' }, 400);
  }
  if (!validAmount(transactionAmount)) {
    return json({ error: 'El monto enviado no es válido.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: donation, error: donationError } = await admin
    .from('donations')
    .select('id,user_id,amount_mxn,currency,status,external_reference,payer_email')
    .eq('id', donationId)
    .maybeSingle();

  if (donationError || !donation) return json({ error: 'No se encontró la donación.' }, 404);
  if (!['created', 'payment_error'].includes(donation.status)) return json({ error: 'Esta donación ya fue procesada o no está disponible.' }, 409);

  const expectedAmount = Number(donation.amount_mxn);
  if (!validAmount(expectedAmount) || Math.round(expectedAmount * 100) !== Math.round(transactionAmount * 100)) {
    return json({ error: 'El monto no coincide con la donación preparada.' }, 400);
  }

  // Si hay una sesión autenticada, comprobamos que pertenece a la donación.
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data } = await authClient.auth.getUser();
    if (data.user && donation.user_id && data.user.id !== donation.user_id) {
      return json({ error: 'La donación no pertenece a la sesión actual.' }, 403);
    }
  }

  const idempotencyKey = uuid();
  const paymentPayload: Record<string, unknown> = {
    transaction_amount: expectedAmount,
    token,
    description: 'Donación a EME GAMES',
    installments,
    payment_method_id: paymentMethodId,
    external_reference: donation.external_reference,
    payer: {
      email,
      ...(identificationType && identificationNumber ? { identification: { type: identificationType, number: identificationNumber } } : {}),
      ...(cardholderName ? { first_name: cardholderName } : {}),
    },
  };

  const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(paymentPayload),
  });

  const payment = await mpResponse.json().catch(() => ({}));
  const nextStatus = mpResponse.ok ? String(payment.status ?? 'unknown') : 'payment_error';

  const { error: updateError } = await admin.from('donations').update({
    status: nextStatus,
    payment_id: payment.id ? String(payment.id) : null,
    payment_status_detail: payment.status_detail ?? null,
    payment_type: payment.payment_type_id ?? null,
    payer_email: payment.payer?.email ?? email,
    paid_at: payment.date_approved ?? null,
    raw_payment: payment,
    updated_at: new Date().toISOString(),
  }).eq('id', donationId);

  if (updateError) console.error(updateError);

  if (!mpResponse.ok) {
    console.error('Mercado Pago payment error', mpResponse.status, payment);
    return json({
      error: payment.message || 'Mercado Pago rechazó la solicitud de pago.',
      status: payment.status ?? 'rejected',
      status_detail: payment.status_detail ?? null,
    }, 502);
  }

  return json({
    donation_id: donationId,
    payment_id: String(payment.id ?? ''),
    status: payment.status ?? 'unknown',
    status_detail: payment.status_detail ?? null,
  });
});
