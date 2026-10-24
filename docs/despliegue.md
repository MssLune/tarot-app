# Despliegue gratuito: Vercel + Neon

Arcana se publica en dos proyectos de Vercel (el frontend y la API) y una base
PostgreSQL en Neon. Los tres en su plan gratuito.

| Pieza | Dónde | Plan |
| --- | --- | --- |
| Frontend (React + Vite) | Vercel, carpeta `frontend` | Hobby (gratis) |
| API (Express) | Vercel, carpeta `backend`, como una función | Hobby (gratis) |
| Base de datos | Neon (PostgreSQL) | Free |
| Inicio de sesión | Clerk, instancia de desarrollo | Gratis |

## Antes de empezar: lo que el plan gratuito no permite

- **Vercel Hobby es sólo para uso no comercial.** Cobrar a los usuarios (Stripe)
  cuenta como uso comercial. Por eso Stripe queda **apagado**: no se cargan sus
  variables y la app funciona entera en plan gratuito («Pro disponible
  pronto»). El día que se quiera cobrar hay que pasar a Vercel Pro (de pago).
- **Clerk en producción necesita un dominio propio.** Con la dirección gratuita
  de Vercel (`algo.vercel.app`) sólo funcionan las claves de **desarrollo**
  (`pk_test_` / `sk_test_`), que admiten hasta **100 usuarios**. Para pasar de
  ahí hay que comprar un dominio (unos 10 USD al año) y crear la instancia de
  producción de Clerk.
- **Neon Free:** 1 GB por proyecto y 100 horas de cómputo al mes. La base se
  apaga sola tras 5 minutos sin uso: la primera consulta después tarda un poco
  más.

## 1. Crear la base en Neon

1. Entra a <https://neon.com> y crea una cuenta y un proyecto (región: la más
   cercana a tus usuarios; para Perú, *AWS São Paulo* si está disponible, o
   *US East*).
2. El proyecto trae la rama **`main`**: esa es la de producción.
3. En **Branches** crea otra rama, **`dev`**, para trabajar en tu computadora.
4. En cada rama, botón **Connect**, copia dos cadenas:
   - la **con pooler** (el host termina en `-pooler…`) → `DATABASE_URL`
   - la **sin pooler** (desmarca *Connection pooling*) → `DIRECT_URL`

## 2. Pasar tu entorno local a PostgreSQL

1. En `backend/.env`, reemplaza la línea de SQLite por las dos cadenas de la
   rama **`dev`** (ver `backend/.env.example`):

   ```
   DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require&pgbouncer=true&connect_timeout=15&pool_timeout=15"
   DIRECT_URL="postgresql://…/neondb?sslmode=require&connect_timeout=15"
   ```

   Lo que va después del `?` importa: `pgbouncer=true` porque el pooler de
   Neon no admite las consultas preparadas de Prisma, y los `timeout` porque
   la base se apaga sola y tarda unos segundos en despertar. Sin eso aparecen
   *«Can't reach database server»* o *«Timed out fetching a new connection»*.
   Si Neon agrega `&channel_binding=require`, déjalo.

2. **Borra la carpeta `backend/prisma/migrations`.** Son las migraciones de
   SQLite y no sirven para PostgreSQL. (El archivo `backend/prisma/dev.db`
   también puede irse: ya no se usa.)
3. Crea la migración inicial para PostgreSQL y carga las cartas:

   ```bash
   cd backend
   npx prisma migrate dev --name init
   npm run db:seed
   ```

4. Para ser administrador, agrega tu correo a `backend/.env` (puedes poner
   varios separados por coma):

   ```
   ADMIN_EMAILS="tu-correo@ejemplo.com"
   ```

   Arranca la app como siempre (`npm run dev` en la raíz) e inicia sesión con
   ese correo: el rol se asigna solo. No hace falta tocar la base.

5. Revisa que todo funcione y sube los cambios a GitHub. Las imágenes de las
   cartas ahora se versionan (antes estaban en `.gitignore`): sin ellas en el
   repositorio, la app publicada no las tendría.

   ```bash
   git add -A
   git commit -m "chore(deploy): move to PostgreSQL (Neon) and add Vercel config"
   git push
   ```

## 3. Preparar la base de producción

La estructura (tablas) la crea Vercel en cada despliegue con
`prisma migrate deploy`. Las cartas hay que cargarlas una vez, desde tu
computadora, apuntando a la rama **`main`**. En PowerShell:

```powershell
cd backend
$env:DATABASE_URL="<cadena CON pooler de main>"
$env:DIRECT_URL="<cadena SIN pooler de main>"
npx prisma migrate deploy
npm run db:seed
```

Cierra esa ventana de PowerShell al terminar, para no seguir apuntando a
producción sin querer.

## 4. Publicar la API

1. En <https://vercel.com>, **Add New → Project**, elige el repositorio.
2. **Root Directory:** `backend`. El resto lo lee de `backend/vercel.json`.
3. **Environment Variables:**

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | cadena **con** pooler de `main`, con `&pgbouncer=true&connect_timeout=15&pool_timeout=15` al final |
   | `DIRECT_URL` | cadena **sin** pooler de `main`, con `&connect_timeout=15` al final |
   | `CLERK_SECRET_KEY` | `sk_test_…` |
   | `CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | por ahora `http://localhost:5173`; se cambia en el paso 6 |
   | `ADMIN_EMAILS` | tu correo (los que serán administradores, separados por coma) |

   Las de Stripe **no** se cargan.
4. **Deploy.** Al terminar, abre `https://<tu-api>.vercel.app/api/health`:
   tiene que responder `{"success":true,"data":{"status":"ok"}}`.

## 5. Publicar el frontend

1. **Add New → Project**, el mismo repositorio.
2. **Root Directory:** `frontend`.
3. **Environment Variables:**

   | Variable | Valor |
   | --- | --- |
   | `VITE_API_URL` | `https://<tu-api>.vercel.app/api` |
   | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_…` (la misma que la API) |

4. **Deploy.** Anota la dirección, por ejemplo `https://arcana.vercel.app`.

## 6. Conectar las dos partes

1. En el proyecto de la **API** → Settings → Environment Variables, cambia
   `FRONTEND_URL` por la dirección del frontend (sin barra al final).
2. **Deployments → Redeploy** para que tome el cambio.

## 7. Webhook de Clerk (opcional, recomendado)

Sincroniza los cambios de los usuarios (nombre, borrado de cuenta) con la base.

1. Panel de Clerk → **Webhooks → Add Endpoint**:
   `https://<tu-api>.vercel.app/api/webhooks/clerk`, con los eventos
   `user.created`, `user.updated` y `user.deleted`.
2. Copia el **Signing Secret** y cárgalo en la API como `CLERK_WEBHOOK_SECRET`.
3. Redeploy de la API.

## Cómo funciona por dentro

- **API:** `backend/vercel.json` corre `npm run vercel-build`, que:
  1. genera el cliente de Prisma (`binaryTargets` incluye el sistema de
     Vercel);
  2. aplica las migraciones pendientes (`prisma migrate deploy`, con
     `DIRECT_URL`);
  3. empaqueta el backend y `@arcana/tarot-core` en
     `dist-vercel/app.cjs` (`scripts/empaquetar.mjs`, con esbuild);
  4. copia las imágenes de las cartas a `public/assets/cards`
     (`scripts/copiarCartas.mjs`), que la CDN de Vercel sirve en la misma URL
     que en local.

  Todas las rutas van a la función `api/index.js` por el *rewrite*. Las
  imágenes se incluyen también dentro de la función (`includeFiles`) porque
  el PDF las lee del disco.

  Vercel sólo sube a la función los archivos que ve requeridos en el código.
  pdfkit carga sus fuentes con un `require` dinámico que no detecta, así que
  `src/pdf/fuentes.ts` las requiere con nombre fijo. Si el PDF empieza a usar
  otra fuente estándar, hay que agregarla ahí: sin eso, el PDF funciona en
  local pero falla en producción con *«Cannot find module …standard-fonts…»*.
- **Frontend:** build normal de Vite; el *rewrite* manda cualquier ruta a
  `index.html`.
- **Instalación:** los dos proyectos instalan desde la raíz del repositorio
  (`cd .. && npm install`) porque es un monorepo y ambos usan
  `packages/tarot-core`.

## Si algo falla

- **Vercel → proyecto → Deployments → el despliegue → Logs** muestra el error
  del build; **Functions** (o *Runtime Logs*) muestra los errores de la API en
  uso.
- *«No pudimos conectar con la API»* en el frontend: revisa `VITE_API_URL`
  (debe terminar en `/api`) y que `FRONTEND_URL` de la API sea exactamente la
  dirección del frontend.
- *Al registrarse o entrar con Google termina en la página de Clerk*
  (`*.accounts.dev`) o vuelve sin la sesión iniciada: la app le dice a Clerk
  que el inicio de sesión y el registro viven en `/?cuenta=entrar` y
  `/?cuenta=registro` (ver `frontend/src/lib/rutaCuenta.ts`). Si se cambia
  esa lógica, hay que mantener esas direcciones.
- *«Verify you are human» de Cloudflare al registrarse*: es la protección
  anti-bots de Clerk. Se puede apagar en el panel de Clerk → *Attack
  protection* → *Bot sign-up protection*.
- *401 al iniciar sesión*: las claves de Clerk del frontend y de la API deben
  ser de la misma instancia.
- Error de Prisma *«Can't reach database server»* o *«Timed out fetching a
  new connection»*: revisa las dos cadenas de Neon y lo que llevan después del
  `?` (paso 2).
