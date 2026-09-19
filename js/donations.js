(function () {
  const supabase = window.EMESupabase;
  const form = document.querySelector('[data-donation-amount-form]');
  const paymentSection = document.querySelector('[data-card-payment-section]');
  const amountInput = document.querySelector('[name="amount"]');
  const status = document.querySelector('[data-donation-status]');
  const summary = document.querySelector('[data-payment-summary]');
  const changeButton = document.querySelector('[data-change-amount]');
  if (!form || !paymentSection || !amountInput || !supabase) return;

  let amount = null;
  let brick = null;
  let reference = null;

  const money = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function show(message, type='info') {
    if (!status) return;
    status.textContent = message;
    status.className = 'notice donation-status ' + type;
    status.hidden = false;
  }
  async function unmount() {
    if (brick) { try { await brick.unmount(); } catch (_) {} brick = null; }
    const container = document.getElementById('cardPaymentBrick_container');
    if (container) container.innerHTML = '';
  }
  async function renderBrick() {
    const publicKey = window.EMEMercadoPagoConfig?.publicKey;
    if (!publicKey || publicKey === 'REEMPLAZA_CON_TU_PUBLIC_KEY') throw new Error('Falta configurar la Public Key de Mercado Pago.');
    if (!window.MercadoPago) throw new Error('No se pudo cargar Mercado Pago.js.');
    await unmount();
    const mp = new MercadoPago(publicKey, { locale: 'es-MX' });
    reference = 'donation-' + crypto.randomUUID();
    brick = await mp.bricks().create('cardPayment', 'cardPaymentBrick_container', {
      initialization: { amount },
      customization: { visual: { style: { theme: 'default' } } },
      callbacks: {
        onReady: () => show('Introduce los datos de tu tarjeta para completar la donación.', 'info'),
        onSubmit: async (data, additionalData) => {
          show('Procesando tu donación...', 'info');
          const { data: authData } = await supabase.auth.getSession();
          const headers = { 'Content-Type': 'application/json' };
          if (authData.session?.access_token) headers.Authorization = 'Bearer ' + authData.session.access_token;

          const response = await fetch(window.EMESupabaseConfig.url + '/functions/v1/create-mercadopago-order', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              amount,
              external_reference: reference,
              token: data.token,
              payment_method_id: data.payment_method_id,
              payment_type_id: additionalData?.paymentTypeId || data.payment_type_id,
              installments: data.installments,
              payer: {
                email: data.payer?.email || '',
                identification: data.payer?.identification || null
              }
            })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            show(result.error || 'No se pudo procesar la donación.', 'error');
            throw new Error(result.error || 'Error al crear la orden.');
          }
          if (result.status === 'approved') show('¡Gracias! Tu donación fue aprobada correctamente.', 'success');
          else if (['pending','in_process','action_required','processing'].includes(result.status)) show('Tu donación quedó pendiente de confirmación. El Webhook actualizará su estado.', 'info');
          else show(result.status_detail ? 'Mercado Pago no pudo completar la donación: ' + result.status_detail + '.' : 'Mercado Pago no pudo completar la donación.', 'error');
        },
        onError: (error) => { console.error('Card Payment Brick:', error); show('Ocurrió un error en el formulario de tarjeta. Revisa los datos.', 'error'); }
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const parsed = Math.round((Number(amountInput.value) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 10000000) {
      show('Introduce un monto entre $0.01 y $10,000,000.00 MXN.', 'error');
      return;
    }
    amount = parsed;
    form.hidden = true;
    paymentSection.hidden = false;
    summary.textContent = 'Monto de la donación: $' + money(amount) + ' MXN';
    try { await renderBrick(); paymentSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (error) { console.error(error); form.hidden = false; paymentSection.hidden = true; show(error.message, 'error'); }
  });

  changeButton?.addEventListener('click', async () => {
    await unmount();
    paymentSection.hidden = true;
    form.hidden = false;
    amountInput.focus();
  });
})();