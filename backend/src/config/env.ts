import 'dotenv/config';

/** Configuración centralizada, leída una sola vez desde variables de entorno. */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? '',

  /* Stripe. Vacío = el billing queda apagado y la app corre toda en plan
     gratuito. Es el mismo patrón que Clerk: se monta sólo si está todo. */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',

  /* Los TRES price ids del Pro. Son `price_...`, NO `prod_...`: el product id
     identifica el producto y el price id identifica el precio. El backend
     compara el precio de cada item contra estos, así que poner un `prod_`
     aquí no da error: la comparación simplemente nunca coincide, el usuario
     paga y queda en gratuito, y no hay ningún aviso.

     Verifica que empiecen con `price_`. Es el error más caro de esta sección
     porque es invisible. */
  stripeMonthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? '',
  stripeAnnualPriceId: process.env.STRIPE_ANNUAL_PRICE_ID ?? '',
  /* El de por vida es un PAGO ÚNICO, no una suscripción. Stripe rechaza los
     precios que no se renuevan en un checkout de suscripción, así que va por
     su propio camino (`mode: 'payment'`). */
  stripeLifetimePriceId: process.env.STRIPE_LIFETIME_PRICE_ID ?? '',

  /* Días de prueba. Va en el mensual y el anual, no en el de por vida: Stripe
     no soporta pruebas en un pago de una sola vez. */
  stripeTrialDays: Number(process.env.STRIPE_TRIAL_DAYS ?? 7),

  // Clerk
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  // clerkMiddleware() necesita AMBAS claves: la secret para leer el token y la
  // publishable para validar su formato y_scope. Sin la publishable, falla al
  // autenticar cualquier request.
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET ?? '',

  /* Correos que reciben el rol de admin solos, separados por coma. Sólo
     cuenta si el correo está VERIFICADO en Clerk. Quitar un correo de la
     lista no le saca el rol a nadie: eso se hace a mano. */
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};

export const isProduction = env.nodeEnv === 'production';

/** true si Clerk tiene lo necesario para autenticar de verdad. */
export const isClerkConfigured = Boolean(env.clerkSecretKey && env.clerkPublishableKey);

/**
 * Los price ids del Pro que están configurados de verdad.
 *
 * Se calculan y no se escriben a mano porque los tres planes se pueden dar de
 * alta por separado: se puede estar vendiendo el mensual y el anual sin haber
 * creado todavía el de por vida. Un plan sin precio no se ofrece, pero los
 * demás siguen funcionando.
 */
export const configuredTiers = {
  monthly: env.stripeMonthlyPriceId,
  annual: env.stripeAnnualPriceId,
  lifetime: env.stripeLifetimePriceId,
};

/** Cuántos de los tres planes se pueden comprar. */
export const configuredTierCount = Object.values(configuredTiers).filter(Boolean).length;

/**
 * true si Stripe está configurado para cobrar.
 *
 * Requiere la secret para hablar con la API, la del webhook para verificar las
 * firmas, y al menos un precio. Si falta cualquiera, `billingRouter` no se
 * monta y las rutas de pago devuelven 404. La app sigue funcionando entera en
 * plan gratuito.
 */
export const isStripeConfigured = Boolean(
  env.stripeSecretKey && env.stripeWebhookSecret && configuredTierCount > 0,
);
