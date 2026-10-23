import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { clerkMiddleware } from '@clerk/express';
import { env, isClerkConfigured, isProduction } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { apiRouter } from './routes';
import { billingRouter } from './routes/billing.routes';
import { stripeWebhookRouter } from './routes/stripeWebhook.routes';
import { webhookRouter } from './routes/webhook';
import { CARDS_DIR, CARDS_ROUTE } from './services/cardImages';

export const app = express();

app.use(cors({ origin: env.frontendUrl }));

/* Las imágenes de las cartas. Se sirven estáticas y no hay protección que
   valga: son el arte de un mazo de dominio público, que cualquiera puede
   descargar igual, y para que la PWA las pueda guardar para usar sin
   conexión tienen que ser archivos que el navegador pueda pedir por URL.
   `index: false` y el dotfiles en "deny" evitan que se liste la carpeta o se
   sirva algo con punto adelante. */
/* Filtro antes del static: `express.static` sirve cualquier archivo de la
   carpeta, y lo único que hay ahí además de los JPG es el README. No es un
   problema de seguridad —es un archivo nuestro— pero es una URL que no
   debería existir.

   Se responde el 404 aquí mismo y no con `next('router')`, que sólo funciona
   dentro de un router y no en la app. */
app.use(CARDS_ROUTE, (req, res, next) => {
  if (/\.(jpe?g|png|webp)$/i.test(req.path)) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'No existe ese archivo.' },
  });
});
app.use(
  CARDS_ROUTE,
  express.static(CARDS_DIR, { index: false, dotfiles: 'deny', maxAge: '30d' }),
);

/* El webhook de Stripe va ANTES del parser de JSON, con su propio parser
   crudo. Si el cuerpo llegara parseado, la firma (un HMAC sobre los bytes
   exactos) no coincidiría y Stripe rechazaría todos los eventos. */
app.use(stripeWebhookRouter);
/* El de Clerk, por el mismo motivo: Svix firma los bytes exactos del cuerpo.
   Se registra aparte porque no usa sesión, sino firma Svix. */
app.use('/api/webhooks', webhookRouter);
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

// Cobro. El router trae sus propios requireAuth y no se monta si Stripe no
// está configurado.
app.use('/api/billing', billingRouter);

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);
