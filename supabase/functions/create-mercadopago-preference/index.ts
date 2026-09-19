import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 10_000_000;

function normalizeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) return null;
  return rounded;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/$/, '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!accessToken || !siteUrl || !supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Falta configurar Mercado Pago o Supabase en las variables de entorno.' }, 500);
  }

  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const amount = normalizeAmount(body.amount);
  if (amount === null) {
    return json({ error: `El monto debe estar entre $${MIN_AMOUNT.toFixed(2)} y $${MAX_AMOUNT.toFixed(2)} MXN.` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  let userId: string | null = null;
  let payerEmail: string | null = null;

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (anonKey) {
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
      const { data } = await authClient.auth.getUser();
      if (data.user) {
        userId = data.user.id;
        payerEmail = data.user.email ?? null;
      }
    }
  }

  const donationId = crypto.randomUUID();
  const externalReference = `donation:${donationId}`;

  const { error: insertError } = await admin.from('donations').insert({
    user_id: userId,
    amount_mxn: amount,
    currency: 'MXN',
    status: 'created',
    external_reference: externalReference,
  });

  if (insertError) {
    console.error(insertError);
    return json({ error: 'No se pudo registrar la donación.' }, 500);
  }

  const preferencePayload = {
    items: [{
      id: 'eme-games-donation',
      title: 'Donación a EME GAMES',
      description: 'Apoyo al desarrollo de juegos independientes y mejoras de Guardian.',
      quantity: 1,
      currency_id: 'MXN',
      unit_price: amount,
    }],
    external_reference: externalReference,
    payer: payerEmail ? { email: payerEmail } : undefined,
    back_urls: {
      success: `${siteUrl}/pages/donar.html?status=success`,
      pending: `${siteUrl}/pages/donar.html?status=pending`,
      failure: `${siteUrl}/pages/donar.html?status=failure`,
    },
    auto_return: 'approved',
    notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
  };

  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferencePayload),
  });

  const mpData = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok || !mpData.init_point) {
    await admin.from('donations').update({ status: 'preference_error' }).eq('external_reference', externalReference);
    console.error('Mercado Pago error', mpResponse.status, mpData);
    return json({ error: 'Mercado Pago no pudo crear el pago.' }, 502);
  }

  await admin.from('donations').update({
    preference_id: mpData.id ?? null,
    init_point: mpData.init_point,
  }).eq('external_reference', externalReference);

  return json({ init_point: mpData.init_point, preference_id: mpData.id, donation_id: donationId });
});
