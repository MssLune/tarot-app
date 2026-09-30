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

    /* Se responde 200 aunque el procesamiento falle. Si devolviéramos un 5xx,
       Stripe reintenta el evento; y como nosotros aplicamos con `upsert`, el
       reintento produce el mismo resultado, así que sólo se gasta cuota. Peor:
       si el error fuera de red, avisar un 5xx hace que Stripe siga
       reintentando para siempre sin que nada cambie.

       O sea: el error se loguea para revisión manual, pero la respuesta es
       200 siempre. Lo que no se puede es no responder. */
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          /* Es el evento que más importa: sin él, el usuario paga y no se le
             activa el Pro hasta que llegue otro. */
          const session = event.data.object;
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

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.resumed': {
          await billingService.syncSubscription(event.data.object);
          break;
        }

        case 'customer.subscription.deleted': {
          await billingService.markCanceled(event.data.object.id);
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
      /* Un error de PROCESAMIENTO no puede hacer fallar el webhook: Stripe
         dejaría de entregar eventos y se perderían cambios de suscripción.
         Se loguea para revisión manual y se responde 200 igual.

         Ojo la diferencia: los errores de arriba (firma inválida, Stripe sin
         configurar) SÍ se propagan, y van a caer en el errorHandler. Eso es
         correcto: son errores de configuración o de ataque, y responder 200 a
         un POST con firma falsa le diría a Stripe que la entrega está bien
         cuando en realidad nunca va a funcionar. */
      console.error(`[billing] Error procesando el evento ${event.type}:`, err);
    }

    res.json({ received: true });
  }),
);
