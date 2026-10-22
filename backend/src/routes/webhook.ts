import { Router, raw } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env';
import { borrarCuenta, desdeWebhookDeClerk, sincronizarUsuario } from '../services/accounts';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const webhookRouter = Router();

/**
 * Webhook de Clerk: sincroniza usuarios con la base de datos.
 * Eventos: user.created, user.updated, user.deleted
 *
 * EL CUERPO LLEGA CRUDO. Svix firma los bytes EXACTOS que envió Clerk. Antes
 * se verificaba sobre `JSON.stringify(req.body)`, es decir, sobre un JSON
 * vuelto a armar después de que `express.json()` lo parseara: cualquier
 * diferencia de formato (espacios, escapes de unicode, orden) cambiaba los
 * bytes y la firma fallaba. Por eso este router se monta en `app.ts` ANTES de
 * `express.json()`, con su propio `raw`, igual que el de Stripe.
 *
 * Respuestas: firma inválida → 400 (no se reintenta: nunca va a valer). Error
 * al procesar → 500, y Svix reintenta. Todo es idempotente (upsert/borrado),
 * así que un reintento deja el mismo resultado.
 */
webhookRouter.post(
  '/clerk',
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    if (!env.clerkWebhookSecret) {
      throw new ApiError(503, 'CLERK_WEBHOOK_NOT_CONFIGURED', 'CLERK_WEBHOOK_SECRET no configurado.');
    }
    if (!Buffer.isBuffer(req.body)) {
      throw new ApiError(400, 'WEBHOOK_NOT_RAW', 'El cuerpo del webhook no llegó crudo.');
    }

    try {
      new Webhook(env.clerkWebhookSecret).verify(req.body, req.headers as Record<string, string>);
    } catch {
      throw new ApiError(400, 'WEBHOOK_BAD_SIGNATURE', 'La firma del webhook no es válida.');
    }

    /* El evento se lee DESPUÉS de verificar, y lo leemos nosotros: las
       versiones nuevas de `svix` sólo comprueban la firma y `verify()` devuelve
       `undefined` (las viejas devolvían el JSON ya parseado). Leerlo acá
       funciona con las dos. */
    const event = JSON.parse(req.body.toString('utf8')) as {
      type: string;
      data: Record<string, unknown> & { id?: string };
    };

    try {
      switch (event.type) {
        case 'user.created':
        case 'user.updated': {
          await sincronizarUsuario(desdeWebhookDeClerk(event.data as never));
          break;
        }

        case 'user.deleted': {
          /* La cuenta ya no existe en Clerk: no hay que borrarla allá, pero sí
             cancelar el cobro antes de borrar la fila. */
          const { id } = event.data;
          if (id) await borrarCuenta(id, { borrarEnClerk: false });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error(`[Clerk Webhook] Error procesando ${event.type}:`, err);
      throw err;
    }

    res.json({ success: true });
  }),
);
