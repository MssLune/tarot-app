# Arcana — Tarot & Oráculo

App de lecturas de Tarot Rider-Waite, Oráculo y mazos personalizados, con
interpretación automática por posición, detección de patrones y conclusión
integradora.

## Arquitectura

```
Usuario
   ↓
Frontend (React + Vite + TS)
   ↓  fetch (services/*)
API REST (Express + TS)
   ↓
Servicios de negocio
   ↓
Prisma ORM
   ↓
SQLite
```

El repo es un monorepo con dos workspaces npm:

```
Tarot/
├── frontend/         App React (Vite + TS + Tailwind + Zustand + Framer Motion)
│   └── src/
│       ├── components/
│       │   ├── screens/     Una pantalla por paso del flujo
│       │   ├── cards/       Layout de tiradas, cartas
│       │   ├── layout/      AppShell (cabecera, pasos, pie)
│       │   └── ui/          Botones, toggles, glifos, etc.
│       ├── services/        Capa de acceso a la API (api.ts, cardsService.ts, spreadsService.ts)
│       ├── store/           Zustand: useContentStore (API) + useReadingStore (sesión/localStorage)
│       ├── lib/              Motor de interpretación, labels, generación de layouts
│       ├── data/            Config de UI (plantillas de mazo, presets de layout) — sin contenido editorial
│       └── types/           Interfaces del dominio
│
├── backend/          API REST (Express + TS + Prisma)
│   └── src/
│       ├── routes/          Definición de endpoints
│       ├── controllers/     Parseo de request / formateo de response
│       ├── services/        Lógica de negocio + acceso a Prisma (limits.ts: topes del plan)
│       ├── models/          DTOs públicos + validación
│       ├── middleware/      Errores, 404, autenticación (Clerk) y límites del plan
│       ├── database/        Cliente Prisma
│       └── config/          Variables de entorno
│   └── prisma/
│       ├── schema.prisma    Modelo de datos
│       └── seed.ts          Carga inicial (78 cartas + 8 tiradas + 5 combinaciones)
│
└── docs/
    ├── stripe.md              Puesta en marcha del cobro
    └── revision-seguridad.md  Estado de la revisión de seguridad
```

## Decisiones arquitectónicas

- **Qué pasó a la base de datos:** las 78 cartas del Rider-Waite (22 Arcanos
  Mayores + 56 Arcanos Menores) y las 8 tiradas predefinidas (antes
  hardcodeadas en `frontend/src/data`, y sólo los Mayores). Es contenido
  editorial: igual para todos los usuarios y con sentido de administrarse
  centralizadamente.
- **Mazo completo (78 cartas) y ficha de referencia:** el contenido de
  `Tarot_guia.docx` (aportado por el usuario) se integró resumido en cada
  carta como campos nuevos — `conceptTags`, `yesNo`/`yesNoReason`,
  `pastText`/`presentText`/`futureText`, `astrology` — visibles en un panel
  "Ver ficha completa" (`frontend/src/components/cards/CardFicha.tsx`),
  independiente del motor de interpretación dinámico. `upright`/`reversed`/
  `keywords`/`advice`/`axis`/`energy` de los 56 Arcanos Menores son síntesis
  propia en el mismo estilo del resto del mazo, porque la guía sólo cubre la
  posición derecha.
- **Orientación en la ficha de referencia:** `conceptTags`, `yesNo` y
  `astrology` son cualidades fijas de la carta y no cambian según cómo salió
  (así lo plantea la guía original, que sólo cubre la posición derecha).
  Pasado/Presente/Futuro sí tiene una variante invertida propia
  (`pastTextReversed`/`presentTextReversed`/`futureTextReversed`) — contenido
  íntegramente propio, ya que la guía no cubre cartas invertidas en absoluto —
  y `CardFicha` recibe la orientación real de la carta (`reversed`) para
  mostrar la versión que corresponde.
- **Qué se quedó en el navegador (localStorage):** los mazos personalizados,
  las tiradas creadas por el usuario y el historial de lecturas. La app no
  tiene usuarios ni autenticación, así que esos datos siguen siendo "del
  dispositivo", no contenido editorial. Si en el futuro se agregan cuentas,
  este es el primer candidato a migrar a la base de datos (ver Pendientes).
- **Motor de interpretación:** sigue siendo lógica 100% de frontend
  (`frontend/src/lib/interpretation.ts`), sin estado ni necesidad de
  servidor. Antes importaba las cartas de un archivo estático; ahora las
  recibe como parámetro (`cardsById`), alimentadas por la API a través de
  `useContentStore`.
- **Base de datos:** SQLite + Prisma. No requiere instalar ni correr un
  servicio de base de datos aparte — ideal para el alcance del proyecto y
  para correr en Windows sin Docker. Prisma da migraciones y seed listos.
- **Formato de las palabras clave de una carta:** se guardan como JSON
  (`string`) en una sola columna en vez de una tabla relacionada, porque son
  atributos simples de la carta sin identidad ni relaciones propias. Las
  posiciones de una tirada sí son una tabla aparte (`spread_positions`)
  porque tienen identidad, orden y coordenadas propias.
- **Interpretación por categoría (amor/trabajo/dinero/salud):** en vez de un
  párrafo completo por carta × categoría (22 cartas × 4 categorías × 2
  orientaciones = contenido inmanejable), cada carta tiene una frase corta
  por categoría (`loveHint`, `workHint`, `moneyHint`, `healthHint`) que se
  inserta en la misma plantilla de interpretación existente. Sólo aplica al
  sistema Rider-Waite, porque es el único con contenido curado en la DB.
- **Combinaciones de cartas** (`card_combinations`): 2-3 ids de carta que,
  si aparecen juntos en una misma tirada (sin importar posición ni
  orientación), disparan un significado especial además del de cada carta
  por separado — ej. La Emperatriz + El Sol → "Anuncio fértil". El contenido
  sembrado es **ilustrativo**, redactado como ejemplo editable, no
  tradición de tarot verificada; conviene revisarlo/ajustarlo como el resto
  de los textos.

## Instalación

Requiere Node.js 18+.

```bash
npm install
```

Esto instala las dependencias de los dos workspaces (`frontend` y `backend`).

## Variables de entorno

Copiar los `.env.example` de cada workspace:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**backend/.env**

| Variable       | Descripción                                  | Default                  |
| -------------- | --------------------------------------------- | ------------------------- |
| `DATABASE_URL` | Ruta del archivo SQLite                       | `file:./dev.db`           |
| `PORT`         | Puerto de la API                              | `4000`                    |
| `FRONTEND_URL` | Origen permitido para CORS                    | `http://localhost:5173`   |
| `NODE_ENV`     | Entorno de ejecución                          | `development`             |

**frontend/.env**

| Variable       | Descripción       | Default                        |
| -------------- | ------------------ | ------------------------------- |
| `VITE_API_URL` | URL base de la API | `http://localhost:4000/api`     |

## Base de datos: migraciones y datos iniciales

```bash
npm run db:migrate    # crea el archivo SQLite y aplica el esquema
npm run db:seed       # carga las 78 cartas + 8 tiradas + 5 combinaciones
```

Ambos comandos son idempotentes: se pueden correr de nuevo sin duplicar
datos (el seed usa `upsert`).

## Ejecutar en desarrollo

**Windows — un solo doble clic:** ejecutar [`iniciar-arcana.bat`](iniciar-arcana.bat)
en la raíz del proyecto. La primera vez instala dependencias y prepara la
base de datos automáticamente; las siguientes veces arranca directo. Abre
una ventana con los logs de backend + frontend y el navegador en
`http://localhost:5173`. Para apagar la app, cerrar esa ventana.

**Manual (cualquier sistema operativo):**

```bash
npm run dev
```

Levanta backend (`http://localhost:4000`) y frontend (`http://localhost:5173`)
en paralelo. También se pueden correr por separado:

```bash
npm run dev:backend
npm run dev:frontend
```

## Build de producción

```bash
npm run build
```

## Endpoints principales

Todas las respuestas siguen el mismo sobre:

```json
{ "success": true, "data": ... }
{ "success": false, "error": { "code": "CARD_NOT_FOUND", "message": "..." } }
```

**Cartas**

| Método | Ruta              | Descripción                                             |
| ------ | ----------------- | -------------------------------------------------------- |
| GET    | `/api/cards`       | Lista cartas. Filtros opcionales: `search`, `element`, `axis`, `energy`, `arcanaType` (mayor/menor), `suit` (bastos/copas/espadas/oros) |
| GET    | `/api/cards/:id`   | Detalle de una carta                                    |
| POST   | `/api/cards`       | Crea una carta **(admin)**                               |
| PUT    | `/api/cards/:id`   | Edita una carta **(admin)**                              |
| DELETE | `/api/cards/:id`   | Elimina una carta **(admin)**                            |

**Tiradas**

| Método | Ruta                 | Descripción                          |
| ------ | -------------------- | -------------------------------------- |
| GET    | `/api/spreads`        | Lista tiradas. Filtro opcional: `search` |
| GET    | `/api/spreads/:id`    | Detalle de una tirada (con posiciones) |
| POST   | `/api/spreads`        | Crea una tirada **(admin)**            |
| PUT    | `/api/spreads/:id`    | Edita una tirada (reemplaza posiciones) **(admin)** |
| DELETE | `/api/spreads/:id`    | Elimina una tirada **(admin)**         |

**Combinaciones**

| Método | Ruta                      | Descripción                              |
| ------ | ------------------------- | ------------------------------------------ |
| GET    | `/api/combinations`        | Lista combinaciones                        |
| GET    | `/api/combinations/:id`    | Detalle de una combinación                 |
| POST   | `/api/combinations`        | Crea una combinación (2-3 ids de carta) **(admin)** |
| PUT    | `/api/combinations/:id`    | Edita una combinación **(admin)**          |
| DELETE | `/api/combinations/:id`    | Elimina una combinación **(admin)**        |

Los `GET` del contenido editorial son públicos. `POST`, `PUT` y `DELETE`
exigen sesión con rol `admin` (`requireAdmin`): sin sesión responden 401 y
con una cuenta que no es admin, 403. El rol se guarda en la tabla `users` y se
cambia desde el panel de administración. El frontend hoy sólo consume los
`GET`; el resto queda listo para editar el contenido desde ese panel.

**Administración** (`/api/admin/*`, rol `admin`)

Listar usuarios, cambiar su rol y borrarlos. Borrar un usuario es completo:
cancela su suscripción en Stripe, borra su cuenta en Clerk y después sus
datos (`services/accounts.ts`, `borrarCuenta`). Un admin no puede borrarse ni
quitarse el rol a sí mismo.

**Webhooks** (sin sesión, verificados por firma, montados antes de
`express.json()` porque la firma se calcula sobre el cuerpo crudo)

- `POST /webhooks/stripe` — ver [`docs/stripe.md`](docs/stripe.md).
- `POST /api/webhooks/clerk` — `user.created` / `user.updated` sincronizan la
  fila; `user.deleted` cancela el cobro y borra los datos. Un usuario nuevo
  sólo reutiliza una fila existente si su email está **verificado**, y nunca
  hereda el rol de admin.

**Datos del usuario** (`/api/user/*`, siempre con sesión)

Mazos (`/decks`), tiradas propias (`/spreads`), lecturas (`/readings`) y
rituales (`/rituals`). El `PUT /:id` de mazos, tiradas y rituales es un
*upsert*: si el id no existe, lo crea.

## Planes y límites

Los topes del plan gratuito están en `backend/src/services/plans.ts`
(`PLAN_LIMITS`) y se comprueban **sólo en el backend**, en un único lugar:
`assertCanCreate` en `backend/src/services/limits.ts`. Lo usan los dos
caminos que crean datos:

- el middleware `enforceLimit`, delante de cada `POST`;
- los upsert de `userService`, cuando un `PUT` va a crear un id nuevo.

Editar o borrar lo que el usuario ya tiene siempre está permitido, aunque
esté en el tope. Pasado el tope, la API responde `402 PLAN_LIMIT_REACHED`.

Los middleware async (`enforceLimit`, `requirePro`) van envueltos en
`asyncHandler`: Express 4 no captura los rechazos de las funciones async, y
sin envolver un error terminaría el proceso.

## Tests

```bash
npm test               # todos los workspaces
npm test -w backend    # sólo la API
```

Los tests de integración del backend usan la base de desarrollo
(`backend/prisma/dev.db`) con usuarios propios que se borran al terminar.

## Tecnologías

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Zustand, Framer Motion
- **Backend:** Node.js, Express, TypeScript
- **Base de datos:** SQLite + Prisma ORM

## Pendientes / mejoras futuras

- Panel de administración para editar cartas y tiradas desde una UI (la API ya soporta el CRUD completo).
- Si se agregan cuentas de usuario, migrar mazos personalizados, tiradas propias e historial de localStorage a la base de datos.
- Paginación en `/api/cards` y `/api/spreads` si el catálogo crece mucho más allá de su tamaño actual.
- Resolver los puntos pendientes de [`docs/revision-seguridad.md`](docs/revision-seguridad.md).
- **Exportar/importar mazos propios como archivo JSON** (alternativa a
  cuentas de usuario, evaluada y pospuesta por pedido explícito): un botón
  "Exportar mazo" que serializa un `CustomDeck` a un `.json` descargable, y
  "Importar mazo" que lo lee con un `<input type="file">` y lo agrega a
  `customDecks` vía `saveCustomDeck`. 100% client-side, sin backend ni
  autenticación — el archivo funciona como mecanismo manual de backup y de
  traspaso entre navegadores/dispositivos. El mismo patrón se puede
  extender después a tiradas propias (`customSpreads`) e historial
  (`history`) si hace falta.
