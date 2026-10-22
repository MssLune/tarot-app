import { Router, raw } from 'express';
import { isStripeConfigured } from '../config/env';
import * as billingService from '../services/billingService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

/* ==========================================================================
   Webhook de Stripe.

   Es la ÚNICA ruta que no pasa por `requireAuth` ni por el parser de JSON
   normal, y por dos motivos que no son opcionales:

   1. El cuerpo tiene que llegar como Buffer crudo. La firma de Stripe es un
      HMAC sobre los bytes EXACTOS que se enviaron; si express ya parseó el
      JSON, los bytes que se hashearían son otros y la firma no calza.

   2. No se autentica por sesión: Stripe no tiene usuario de Arcana.

   Por eso va montada aparte, con su propio `raw` parser, y NO detrás del
   `/api` general: si quedara después del `express.json()` de la app, la
   verificación de firma fallaría siempre.

   Y va envuelta en `asyncHandler`. Express 4 no captura los rechazos de los
   handlers async: un `throw` dentro de una función async se convierte en una
   promesa rechazada que nadie escucha, y Node termina el proceso. Sin el
   envolver, cualquier POST a esta ruta —incluido uno sin firma, con Stripe
   sin configurar, o con la API de Stripe caída— tumba el servidor entero.
   ========================================================================== */

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/webhooks/stripe',
  // El orden de los middlewares importa: raw ANTES de cualquier parseo.
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    if (!isStripeConfigured) {
      throw new ApiError(503, 'BILLING_NOT_CONFIGURED', 'Stripe no está configurado.');
    }

    /* El header puede llegar como array si se repite; nos sirve el primero. */
    const rawSignature = req.headers['stripe-signature'];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
    const payload = req.body as Buffer;
    if (!Buffer.isBuffer(payload)) {
      throw new ApiError(400, 'WEBHOOK_NOT_RAW', 'El cuerpo del webhook no llegó crudo.');
    }

    const event = billingService.verifyWebhook(payload, signature);

    /* Si el PROCESAMIENTO falla, se responde 500 y Stripe reintenta.

       Antes se respondía 200 siempre, y eso perdía eventos: si la base estaba
       ocupada o la API de Stripe no contestaba en ese momento, Stripe daba el
       evento por entregado y no lo volvía a mandar. En el pago de por vida,
       que se concede sólo con este evento, el usuario pagaba y no recibía
       nada.

       Reintentar es seguro porque todo se aplica con `upsert` y se deriva del
       estado actual: el mismo evento dos veces deja el mismo resultado.
       Stripe reintenta con espera creciente durante tres días.

       Lo que NO es un error no lanza: un evento que no se puede atribuir a
       nadie, o un precio que no es nuestro, se loguea y se responde 200,
       porque reintentarlo daría siempre lo mismo. */
    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          /* Una compra de por vida no deja suscripción, así que este evento
             es el ÚNICO lugar donde se concede. `grantLifetime` comprueba que
             el pago esté cobrado: con pagos diferidos, `completed` llega
             antes que el dinero y `async_payment_succeeded` llega con él. */
          const session = event.data.object;

          if (session.mode === 'payment') {
            await billingService.grantLifetime(session.id);
            break;
          }

          if (session.subscription) {
            const subId =
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription.id;
            /* Se recupera la suscripción completa: el objeto del evento viene
               recortado y no tiene los items con el precio, que es de donde
               sale el plan. */
            const subscription = await billingService.retrieveSubscription(subId);
            await billingService.syncSubscription(subscription, session.metadata);
          }
          break;
        }

        case 'checkout.session.async_payment_failed': {
          console.warn('[billing] Falló el pago diferido de un checkout.', {
            session: event.data.object.id,
          });
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.resumed': {
          /* Stripe no garantiza el orden de entrega: un `updated` viejo puede
             llegar después de uno nuevo. Por eso no se usa el objeto del
             evento sino el estado ACTUAL, pedido a la API en este momento. */
          const subscription = await billingService.retrieveSubscription(event.data.object.id);
          await billingService.syncSubscription(subscription);
          break;
        }

        case 'customer.subscription.deleted': {
          await billingService.markCanceled(event.data.object.id);
          break;
        }

        case 'charge.refunded': {
          /* Sólo el reembolso TOTAL quita el de por vida. Uno parcial es un
             descuento o una compensación, no una devolución de la compra. */
          const charge = event.data.object;
          const pi =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id;
          if (charge.refunded && pi) {
            await billingService.revokeLifetime(pi, 'refunded');
          }
          break;
        }

        case 'charge.dispute.closed': {
          /* Se quita al PERDER la disputa, no al abrirse: mientras está
             abierta todavía se puede ganar, y quitarle el acceso a quien
             después resulta tener razón no se arregla con un perdón. */
          const dispute = event.data.object;
          const pi =
            typeof dispute.payment_intent === 'string'
              ? dispute.payment_intent
              : dispute.payment_intent?.id;
          if (dispute.status === 'lost' && pi) {
            await billingService.revokeLifetime(pi, 'dispute_lost');
          }
          break;
        }

        case 'invoice.payment_failed': {
          /* La tarjeta falló. El estado real (past_due) llega con el
             `customer.subscription.updated` que Stripe emite enseguida, así
             que acá sólo se registra para poder investigar. */
          console.warn('[billing] Falló el pago de una factura.', {
            customer: (event.data.object as { customer?: string }).customer,
          });
          break;
        }

        default:
          /* Los eventos que no nos interesan se reconocen y se ignoran. */
          break;
      }
    } catch (err) {
      console.error(`[billing] Error procesando el evento ${event.type} (${event.id}):`, err);
      /* Al errorHandler: responde 500 y Stripe reintenta. */
      throw err;
    }

    res.json({ received: true });
  }),
);
