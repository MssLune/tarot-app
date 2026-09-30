import 'dotenv/config';

/** Configuración centralizada, leída una sola vez desde variables de entorno. */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',

  /* Stripe. Vacío = el billing queda apagado y la app corre toda en plan
     gratuito. Es el mismo patrón que Clerk: se monta sólo si está todo. */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  /* Price id de la suscripción Pro, del panel de Stripe. */
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',

  // Clerk
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  // clerkMiddleware() necesita AMBAS claves: la secret para leer el token y la
  // publishable para validar su formato y_scope. Sin la publishable, falla al
  // autenticar cualquier request.
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET ?? '',
};

export const isProduction = env.nodeEnv === 'production';

/** true si Clerk tiene lo necesario para autenticar de verdad. */
export const isClerkConfigured = Boolean(env.clerkSecretKey && env.clerkPublishableKey);

/**
 * true si Stripe está configurado para cobrar.
 *
 * Requiere las tres claves: la secret para hablar con la API, la del webhook
 * para verificar las firmas, y el price id del plan Pro. Si falta cualquiera,
 * `billingRouter` no se monta y las rutas de pago devuelven 503 con un
 * mensaje claro. La app sigue funcionando entera en plan gratuito.
 */
export const isStripeConfigured = Boolean(
  env.stripeSecretKey && env.stripeWebhookSecret && env.stripeProPriceId,
);
