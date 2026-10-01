import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/clerk';
import { isStripeConfigured } from '../config/env';
import * as billingController from '../controllers/billingController';

export const billingRouter = Router();

// Rutas de cobro. Si Stripe no está configurado, el router no se monta y el
// frontend recibe 404 en vez de un error de Stripe sin contexto. La app
// sigue funcionando entera en plan gratuito.
if (!isStripeConfigured) {
  console.warn(
    '[billing] Stripe sin configurar: el cobro queda deshabilitado y todos los ' +
      'usuarios están en plan gratuito. Revisar STRIPE_SECRET_KEY, ' +
      'STRIPE_WEBHOOK_SECRET y STRIPE_PRO_PRICE_ID en backend/.env',
  );
} else {
  /* Todas exigen sesión: nadie puede abrir un checkout sin estar identificado. */
  billingRouter.use(requireAuth);

  billingRouter.get('/subscription', asyncHandler(billingController.getMySubscription));
  billingRouter.get('/usage', asyncHandler(billingController.getUsage));
  /* El catálogo no necesita ser secreto: es la lista de precios pública. Va
     detrás de `requireAuth` igual porque el router entero lo exige, y así no
     hace falta una excepción. */
  billingRouter.get('/plans', asyncHandler(billingController.getPlans));
  billingRouter.post('/checkout', asyncHandler(billingController.createCheckout));
  billingRouter.post('/portal', asyncHandler(billingController.createPortal));
}
