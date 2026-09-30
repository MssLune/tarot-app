import 'dotenv/config';

/** Configuración centralizada, leída una sola vez desde variables de entorno. */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',

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
