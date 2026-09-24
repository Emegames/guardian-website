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

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Falta configuración de Supabase en la función.' }, 500);
  }

  let body: { amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const amount = Number(body.amount);
  if (!isValidAmount(amount)) {
    return json({ error: 'El monto debe estar entre $0.01 y $10,000,000 MXN.' }, 400);
  }

  const roundedAmount = Math.round(amount * 100) / 100;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let userId: string | null = null;
  let payerEmail: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data } = await authClient.auth.getUser();
    if (data.user) {
      userId = data.user.id;
      payerEmail = data.user.email ?? null;
    }
  }

  const donationId = crypto.randomUUID();
  const externalReference = `donation:${donationId}`;

  const { error } = await admin.from('donations').insert({
    id: donationId,
    user_id: userId,
    amount_mxn: roundedAmount,
    currency: 'MXN',
    status: 'created',
    external_reference: externalReference,
    payer_email: payerEmail,
  });

  if (error) {
    console.error(error);
    return json({ error: 'No se pudo preparar la donación.' }, 500);
  }

  return json({
    donation_id: donationId,
    external_reference: externalReference,
    amount: roundedAmount,
    payer_email: payerEmail,
  });
});
