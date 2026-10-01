(() => {
    'use strict';

    const config = window.EMEMercadoPagoConfig || {};

    const MIN_AMOUNT = 0.01;
    const MAX_AMOUNT = 10_000_000;

    const SUPABASE_FUNCTIONS_URL =
        'https://hbttkdkqgyqbluuabyhk.supabase.co/functions/v1';

    let currentDonationId = null;
    let currentAmount = null;
    let cardPaymentBrickController = null;

    function getFunctionsUrl(functionName) {
        return `${SUPABASE_FUNCTIONS_URL}/${functionName}`;
    }

    function getSupabaseClient() {
        return window.supabaseClient || window.supabase || null;
    }

    function parseAmount(value) {
        const normalized = String(value ?? '')
            .trim()
            .replace(',', '.');

        const amount = Number(normalized);

        if (!Number.isFinite(amount)) {
            return null;
        }

        return amount;
    }

    function isValidAmount(amount) {
        return (
            typeof amount === 'number' &&
            Number.isFinite(amount) &&
            amount >= MIN_AMOUNT &&
            amount <= MAX_AMOUNT
        );
    }

    function formatAmount(amount) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    function setMessage(message, type = '') {
        const elements = document.querySelectorAll(
            '[data-donation-message]'
        );

        elements.forEach((element) => {
            element.textContent = message || '';
            element.dataset.type = type;
        });
    }

    function showPaymentSection(show) {
        const section = document.querySelector(
            '[data-card-payment-section]'
        );

        if (!section) {
            return;
        }

        section.hidden = !show;
    }

    function setSubmitButtonDisabled(disabled) {
        const buttons = document.querySelectorAll(
            '[data-donation-submit]'
        );

        buttons.forEach((button) => {
            button.disabled = disabled;
        });
    }

    function destroyCardPaymentBrick() {
        if (!cardPaymentBrickController) {
            return;
        }

        try {
            cardPaymentBrickController.unmount();
        } catch (error) {
            console.warn(
                'No se pudo desmontar el Card Payment Brick:',
                error
            );
        }

        cardPaymentBrickController = null;
    }

    async function getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        const supabaseClient = getSupabaseClient();

        if (supabaseClient && supabaseClient.auth) {
            try {
                const sessionResult =
                    await supabaseClient.auth.getSession();

                const accessToken =
                    sessionResult?.data?.session?.access_token;

                if (accessToken) {
                    headers.Authorization =
                        `Bearer ${accessToken}`;
                }
            } catch (error) {
                console.warn(
                    'No se pudo obtener la sesión de Supabase:',
                    error
                );
            }
        }

        return headers;
    }

    async function createDonation(amount) {
        const headers = await getAuthHeaders();

        const response = await fetch(
            getFunctionsUrl('create-donation'),
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    amount
                })
            }
        );

        let result = {};

        try {
            result = await response.json();
        } catch {
            result = {};
        }

        if (!response.ok) {
            throw new Error(
                result.error ||
                'No se pudo crear la donación.'
            );
        }

        if (!result.donation_id) {
            throw new Error(
                'Supabase no devolvió el identificador de la donación.'
            );
        }

        return result;
    }

    async function renderCardPaymentBrick(amount, donationId) {
        destroyCardPaymentBrick();

        const container =
            document.getElementById(
                'cardPaymentBrick_container'
            );

        if (!container) {
            throw new Error(
                'No se encontró cardPaymentBrick_container.'
            );
        }

        if (!window.MercadoPago) {
            throw new Error(
                'El SDK de Mercado Pago no está disponible.'
            );
        }

        const publicKey = String(
            config.publicKey || ''
        ).trim();

        if (!publicKey) {
            throw new Error(
                'No está configurada la Public Key de Mercado Pago.'
            );
        }

        const mp =
            new window.MercadoPago(
                publicKey,
                {
                    locale: 'es-MX'
                }
            );

        const bricksBuilder =
            mp.bricks();

        const settings = {
            initialization: {
                amount: amount
            },

            customization: {
                paymentMethods: {
                    creditCard: 'all',
                    debitCard: 'all',
                    minInstallments: 1,
                    maxInstallments: 1
                },

                visual: {
                    style: {
                        theme: 'default'
                    }
                }
            },

            callbacks: {
                onReady: () => {
                    // Card Payment Brick listo.
                },

                onSubmit: async (submission) => {
                    const formData =
                        submission?.formData ||
                        submission?.data ||
                        submission ||
                        {};

                    // Nunca imprimimos submission completo:
                    // contiene información sensible de pago.
                    if (!formData?.token) {
                        throw new Error(
                            'El Card Payment Brick no devolvió el token de la tarjeta.'
                        );
                    }

                    try {
                        setMessage(
                            'Procesando tu pago...',
                            'loading'
                        );

                        const headers =
                            await getAuthHeaders();

                        const response =
                            await fetch(
                                getFunctionsUrl(
                                    'process-mercadopago-payment'
                                ),
                                {
                                    method: 'POST',
                                    headers,
                                    body: JSON.stringify({
                                        donation_id:
                                            donationId,

                                        amount:
                                            amount,

                                        formData: {
                                            token:
                                                formData.token,

                                            payment_method_id:
                                                formData.payment_method_id,

                                            payment_method_type:
                                                formData.payment_type_id ||
                                                formData.paymentTypeId ||
                                                'credit_card',

                                            installments: 1,

                                            payer:
                                                formData.payer
                                        }
                                    })
                                }
                            );

                        let result = {};

                        try {
                            result =
                                await response.json();
                        } catch {
                            result = {};
                        }

                        /*
                         * --------------------------------------------------
                         * PAGO RECHAZADO
                         * --------------------------------------------------
                         *
                         * El backend ya guardó la donación como "rejected".
                         *
                         * En lugar de solamente mostrar el error en esta
                         * página, enviamos al usuario a:
                         *
                         * gracias-donacion.html?donation_id=...
                         *
                         * Allí se mostrará la pantalla de donación fallida.
                         */
                        if (!response.ok) {
                            const rejectedDonationId =
                                result.donation_id ||
                                donationId;

                            const errorParams =
                                new URLSearchParams({
                                    donation_id:
                                        String(
                                            rejectedDonationId
                                        ),

                                    amount:
                                        String(amount),

                                    payment_id:
                                        String(
                                            result.payment_id ||
                                            ''
                                        ),

                                    order_id:
                                        String(
                                            result.order_id ||
                                            ''
                                        ),

                                    result:
                                        'rejected'
                                });

                            window.location.href =
                                `gracias-donacion.html?${errorParams.toString()}`;

                            return result;
                        }

                        /*
                         * --------------------------------------------------
                         * PAGO EXITOSO
                         * --------------------------------------------------
                         */
                        const successfulStatus =
                            result.status === 'processed' &&
                            result.status_detail === 'accredited';

                        if (successfulStatus) {
                            const params =
                                new URLSearchParams({
                                    donation_id:
                                        String(donationId),

                                    amount:
                                        String(amount),

                                    payment_id:
                                        String(
                                            result.payment_id ||
                                            ''
                                        ),

                                    order_id:
                                        String(
                                            result.order_id ||
                                            ''
                                        ),

                                    result:
                                        'success'
                                });

                            window.location.href =
                                `gracias-donacion.html?${params.toString()}`;

                            return result;
                        }

                        /*
                         * --------------------------------------------------
                         * PAGO PENDIENTE / EN VERIFICACIÓN
                         * --------------------------------------------------
                         */
                        const pendingParams =
                            new URLSearchParams({
                                donation_id:
                                    String(donationId),

                                amount:
                                    String(amount),

                                payment_id:
                                    String(
                                        result.payment_id ||
                                        ''
                                    ),

                                order_id:
                                    String(
                                        result.order_id ||
                                        ''
                                    ),

                                result:
                                    'pending'
                            });

                        window.location.href =
                            `gracias-donacion.html?${pendingParams.toString()}`;

                        return result;

                    } catch (error) {
                        console.error(
                            'Error procesando el pago:',
                            error
                        );

                        setMessage(
                            error?.message ||
                            'No se pudo procesar el pago.',
                            'error'
                        );

                        throw error;
                    }
                },

                onError: (error) => {
                    console.error(
                        'MP DEBUG Card Payment Brick error:',
                        error
                    );

                    setMessage(
                        'Ocurrió un error con el formulario de pago.',
                        'error'
                    );
                }
            }
        };

        cardPaymentBrickController =
            await bricksBuilder.create(
                'cardPayment',
                'cardPaymentBrick_container',
                settings
            );
    }

    function handleChangeAmount() {
        destroyCardPaymentBrick();
        showPaymentSection(false);

        const form = document.querySelector(
            '[data-donation-amount-form]'
        );

        const amountInput = form?.querySelector(
            '[name="amount"], [data-donation-amount]'
        );

        if (amountInput) {
            amountInput.focus();
            amountInput.select?.();
        }

        setMessage('', '');
        currentDonationId = null;
        currentAmount = null;
    }

    async function handleDonationSubmit(event) {
        event.preventDefault();

        const form =
            event.currentTarget;

        const amountInput =
            form.querySelector(
                '[name="amount"], [data-donation-amount]'
            );

        if (!amountInput) {
            setMessage(
                'No se encontró el campo del monto.',
                'error'
            );

            return;
        }

        const amount =
            parseAmount(
                amountInput.value
            );

        if (!isValidAmount(amount)) {
            setMessage(
                `El monto debe estar entre ${formatAmount(
                    MIN_AMOUNT
                )} y ${formatAmount(
                    MAX_AMOUNT
                )}.`,
                'error'
            );

            return;
        }

        try {
            setSubmitButtonDisabled(true);

            setMessage(
                'Preparando tu donación...',
                'loading'
            );

            showPaymentSection(false);
            destroyCardPaymentBrick();

            /*
             * IMPORTANTE:
             *
             * Cada vez que el usuario comienza una nueva donación
             * se crea un nuevo donation_id.
             *
             * Esto evita reutilizar el mismo X-Idempotency-Key
             * después de un pago rechazado.
             */
            const donation =
                await createDonation(
                    amount
                );

            currentDonationId =
                donation.donation_id;

            currentAmount =
                amount;

            console.log(
                'Donation created:',
                {
                    donation_id:
                        donation.donation_id,

                    amount:
                        donation.amount,

                    external_reference:
                        donation.external_reference
                }
            );

            showPaymentSection(true);

            setMessage(
                `Donación preparada por ${formatAmount(
                    amount
                )}. Completa los datos de tu tarjeta.`,
                'success'
            );

            await renderCardPaymentBrick(
                amount,
                currentDonationId
            );

        } catch (error) {
            console.error(
                'Error preparando la donación:',
                error
            );

            setMessage(
                error?.message ||
                'No se pudo preparar la donación.',
                'error'
            );

            showPaymentSection(false);
            destroyCardPaymentBrick();

        } finally {
            setSubmitButtonDisabled(false);
        }
    }

    function initialize() {
        const form =
            document.querySelector(
                '[data-donation-amount-form]'
            );

        if (!form) {
            console.warn(
                'No se encontró [data-donation-amount-form].'
            );

            return;
        }

        form.addEventListener(
            'submit',
            handleDonationSubmit
        );

        const changeAmountButton =
            document.querySelector(
                '[data-change-amount]'
            );

        changeAmountButton?.addEventListener(
            'click',
            handleChangeAmount
        );

        showPaymentSection(false);

        console.log(
            'Donations.js inicializado correctamente.'
        );
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            initialize
        );
    } else {
        initialize();
    }
})();
