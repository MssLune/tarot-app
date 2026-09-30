import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { clerkMiddleware } from '@clerk/express';
import { env, isClerkConfigured, isProduction } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { apiRouter } from './routes';
import { webhookRouter } from './routes/webhook';

export const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Clerk inyecta los claims de autenticación en req.auth. Debe ir antes de
// cualquier ruta que use getAuth() (las de /api/user y /api/admin).
// Se monta sólo si hay secret + publishable: si falta alguna, se saltea para
// que el contenido editorial público (/api/cards, /api/spreads) siga
// sirviendo en vez de caer en 500.
if (isClerkConfigured) {
  app.use(clerkMiddleware());
} else {
  console.warn(
    '[arcana-api] Clerk no configurado (CLERK_SECRET_KEY o CLERK_PUBLISHABLE_KEY ' +
      'faltan): las rutas /api/user y /api/admin responden 401.',
  );
}

// Webhook de Clerk: se registra aparte porque no usa sesión, sino firma Svix.
app.use('/api/webhooks', webhookRouter);

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);
