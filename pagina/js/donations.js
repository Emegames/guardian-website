(function () {
  const supabase = window.EMESupabase;
  const config = window.EMEMercadoPagoConfig || {};
  const amountForm = document.querySelector('[data-donation-amount-form]');
  const paymentSection = document.querySelector('[data-card-payment-section]');
  const amountInput = document.querySelector('[name="amount"]');
  const summary = document.querySelector('[data-donation-summary]');
  const changeAmountButton = document.querySelector('[data-change-amount]');
  const status = document.querySelector('[data-donation-status]');
  const MIN_AMOUNT = 0.01;
  const MAX_AMOUNT = 10000000;
  let donationId = null;
  let preparedAmount = null;
  let cardPaymentBrickController = null;

  if (!amountForm || !paymentSection || !amountInput || !supabase) return;

  function showStatus(message, type = 'info') {
    if (!status) return;
    status.textContent = message;
    status.className = `notice donation-status ${type}`;
    status.hidden = false;
  }

  function money(value) {
    return Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  }

  function parseAmount() {
    const value = Number(amountInput.value);
    if (!Number.isFinite(value) || value < MIN_AMOUNT || value > MAX_AMOUNT) return null;
    return Math.round(value * 100) / 100;
  }

  function getFunctionsUrl(functionName) {
    return `${window.EMESupabaseConfig.url}/functions/v1/${functionName}`;
  }

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return { headers, session };
  }

  async function unmountBrick() {
    if (cardPaymentBrickController && typeof cardPaymentBrickController.unmount === 'function') {
      try { await cardPaymentBrickController.unmount(); } catch (error) { console.warn(error); }
    }
    cardPaymentBrickController = null;
    window.cardPaymentBrickController = null;
  }

  function publicKeyReady() {
    return typeof config.publicKey === 'string' && config.publicKey.trim() && !config.publicKey.includes('REEMPLAZAR');
  }

  async function renderCardPaymentBrick(amount, payerEmail) {
    if (!publicKeyReady()) {
      showStatus('Falta configurar la Public Key de Mercado Pago en js/mercadopago-config.js.', 'error');
      return;
    }
    if (typeof window.MercadoPago !== 'function') {
      showStatus('No se pudo cargar el SDK de Mercado Pago. Comprueba tu conexión y vuelve a intentarlo.', 'error');
      return;
    }

    await unmountBrick();
    const container = document.getElementById('cardPaymentBrick_container');
    if (container) container.innerHTML = '';

    const mp = new window.MercadoPago(config.publicKey.trim(), { locale: 'es-MX' });
    const bricksBuilder = mp.bricks();

    const settings = {
      initialization: {
        amount,
        ...(payerEmail ? { payer: { email: payerEmail } } : {})
      },
      customization: {
        visual: {
          style: { theme: 'default' }
        },
        paymentMethods: {
          maxInstallments: 1
        }
      },
      callbacks: {
        onReady: () => {
          showStatus('Formulario de pago listo. Tus datos de tarjeta son gestionados por Mercado Pago.', 'info');
        },
        onSubmit: async (formData) => {
          showStatus('Procesando tu donación...', 'info');
          const { headers } = await getAuthHeaders();

          try {
            const response = await fetch(getFunctionsUrl('process-mercadopago-payment'), {
              method: 'POST',
              headers,
              body: JSON.stringify({ donation_id: donationId, amount: preparedAmount, formData })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
              const detail = data.status_detail ? ` (${data.status_detail})` : '';
              throw new Error((data.error || 'No se pudo procesar el pago.') + detail);
            }

            if (data.status === 'approved') {
              showStatus('¡Gracias! Tu donación fue aprobada correctamente por Mercado Pago.', 'success');
            } else if (data.status === 'pending' || data.status === 'in_process') {
              showStatus('Tu donación quedó pendiente de confirmación por Mercado Pago.', 'info');
            } else {
              showStatus('Mercado Pago recibió la operación, pero su estado actual es: ' + data.status + '.', 'info');
            }
            await unmountBrick();
            return Promise.resolve();
          } catch (error) {
            console.error(error);
            showStatus(error.message || 'No se pudo procesar la donación.', 'error');
            return Promise.reject(error);
          }
        },
        onError: (error) => {
          console.error('Mercado Pago Card Payment Brick', error);
          showStatus('Mercado Pago indicó un error en el formulario. Revisa los datos e inténtalo nuevamente.', 'error');
        }
      }
    };

    cardPaymentBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', settings);
    window.cardPaymentBrickController = cardPaymentBrickController;
  }

  amountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseAmount();
    if (amount === null) {
      showStatus('Introduce un monto válido entre $0.01 y $10,000,000.00 MXN.', 'error');
      amountInput.focus();
      return;
    }

    const submitButton = amountForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Preparando pago...';
    showStatus('Preparando una donación segura...', 'info');

    try {
      const { headers, session } = await getAuthHeaders();
      const response = await fetch(getFunctionsUrl('create-donation'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.donation_id) throw new Error(data.error || 'No se pudo preparar la donación.');

      donationId = data.donation_id;
      preparedAmount = Number(data.amount);
      summary.textContent = money(preparedAmount);
      amountForm.hidden = true;
      paymentSection.hidden = false;
      showStatus('Ahora completa los datos de tu tarjeta para realizar la donación.', 'info');
      await renderCardPaymentBrick(preparedAmount, session?.user?.email || data.payer_email || '');
      paymentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'No se pudo preparar la donación.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Continuar con el pago';
    }
  });

  changeAmountButton?.addEventListener('click', async () => {
    await unmountBrick();
    donationId = null;
    preparedAmount = null;
    paymentSection.hidden = true;
    amountForm.hidden = false;
    showStatus('Puedes cambiar el monto de tu donación.', 'info');
    amountInput.focus();
  });

  window.addEventListener('beforeunload', () => {
    if (cardPaymentBrickController && typeof cardPaymentBrickController.unmount === 'function') {
      cardPaymentBrickController.unmount();
    }
  });

  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('status');
  if (paymentStatus === 'success') showStatus('Mercado Pago informó que el pago fue aprobado.', 'success');
  if (paymentStatus === 'pending') showStatus('Tu pago quedó pendiente.', 'info');
  if (paymentStatus === 'failure') showStatus('El pago no se completó. Puedes intentarlo nuevamente.', 'error');
})();
