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

        console.log(
            'CREATE DONATION RESPONSE:',
            {
                http_status: response.status,
                ok: response.ok,
                result
            }
        );

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
                    debitCard: 'all'
                },

                visual: {
                    style: {
                        theme: 'default'
                    }
                }
            },

            callbacks: {
                onReady: () => {
                    console.log(
                        'MP DEBUG Card Payment Brick listo'
                    );
                },

                onSubmit: async (submission) => {
                    const formData =
                        submission?.formData ||
                        submission?.data ||
                        submission ||
                        {};

                    // No imprimimos el submission completo porque
                    // contiene el token de la tarjeta.

                    console.log(
                        'MP DEBUG payment_method_id:',
                        formData?.payment_method_id
                    );

                    console.log(
                        'MP DEBUG installments:',
                        formData?.installments
                    );

                    console.log(
                        'MP DEBUG transaction_amount:',
                        formData?.transaction_amount
                    );

                    console.log(
                        'MP DEBUG payer:',
                        formData?.payer
                    );

                    console.log(
                        'MP DEBUG token exists:',
                        Boolean(formData?.token)
                    );

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
                                            issuer_id:
                                                formData.issuer_id,
                                            payment_method_id:
                                                formData.payment_method_id,
                                            transaction_amount:
                                                formData.transaction_amount,
                                            installments:
                                                formData.installments,
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

                        console.log(
                            'MP PAYMENT RESPONSE DEBUG JSON:',
                            JSON.stringify(
                                {
                                    http_status: response.status,
                                    ok: response.ok,
                                    result
                                },
                                null,
                                2
                            )
                        );

                        if (!response.ok) {
                            throw new Error(
                                result.error ||
                                result.message ||
                                result.status_detail ||
                                'Mercado Pago rechazó el pago.'
                            );
                        }

                        console.log(
                            'MP PAYMENT SUCCESS:',
                            {
                                donation_id:
                                    result.donation_id,
                                payment_id:
                                    result.payment_id,
                                status:
                                    result.status,
                                status_detail:
                                    result.status_detail
                            }
                        );

                        setMessage(
                            result.status === 'approved'
                                ? '¡Donación realizada correctamente!'
                                : `Pago enviado. Estado: ${result.status || 'pendiente'}.`,
                            'success'
                        );

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

        showPaymentSection(false);

        console.log(
            'Donations.js inicializado correctamente.'
        );

        console.log(
            'Supabase Functions URL:',
            SUPABASE_FUNCTIONS_URL
        );

        console.log(
            'Mercado Pago Public Key:',
            config.publicKey
                ? 'configurada'
                : 'NO configurada'
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
