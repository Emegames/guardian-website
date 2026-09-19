(function () {
  const supabase = window.EMESupabase;
  const form = document.querySelector('[data-donation-form]');
  if (!form || !supabase) return;

  const status = document.querySelector('[data-donation-status]');
  const amount = form.querySelector('[name="amount"]');
  const MIN_AMOUNT = 0.01;
  const MAX_AMOUNT = 10000000;

  function parseDonationAmount(value) {
    const normalized = String(value ?? '').replace(/,/g, '').trim();
    if (!normalized) return NaN;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return NaN;
    return Math.round((parsed + Number.EPSILON) * 100) / 100;
  }
  const button = form.querySelector('button[type="submit"]');

  function showStatus(message, type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.className = `notice donation-status ${type}`;
    status.hidden = false;
  }

  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('status');
  if (paymentStatus === 'success') showStatus('Gracias por apoyar el proyecto. Mercado Pago informó que el pago fue aprobado.', 'success');
  if (paymentStatus === 'pending') showStatus('Tu pago quedó pendiente. Mercado Pago actualizará su estado cuando corresponda.', 'info');
  if (paymentStatus === 'failure') showStatus('El pago no se completó. Puedes intentarlo nuevamente.', 'error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedAmount = parseDonationAmount(amount.value);
    if (!Number.isFinite(selectedAmount) || selectedAmount < MIN_AMOUNT || selectedAmount > MAX_AMOUNT) {
      showStatus(`Introduce un monto entre $${MIN_AMOUNT.toFixed(2)} y $${MAX_AMOUNT.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN.`, 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Preparando pago...';
    showStatus('Conectando con Mercado Pago...', 'info');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const response = await fetch(`${window.EMESupabaseConfig.url}/functions/v1/create-mercadopago-preference`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount: selectedAmount })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.init_point) throw new Error(data.error || 'No se pudo crear la preferencia de pago.');
      window.location.href = data.init_point;
    } catch (error) {
      console.error(error);
      showStatus('No se pudo iniciar el pago. Revisa la configuración de Mercado Pago en Supabase e inténtalo de nuevo.', 'error');
      button.disabled = false;
      button.textContent = 'Continuar con Mercado Pago';
    }
  });
})();
