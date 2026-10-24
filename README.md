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
PostgreSQL (Neon)
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
- **Modo invitado:** la app se usa sin cuenta. Sin iniciar sesión se pueden
  hacer lecturas con Rider-Waite u Oráculo y las tiradas predeterminadas, ver
  el resultado completo y consultar la Luna (fases, calendario, eclipses,
  retrógrados, festividades). Lo que se **guarda** pide cuenta: guardar una
  lectura, el historial, los mazos propios, las tiradas personalizadas y los
  rituales. En esos casos se abre la pantalla de inicio de sesión con el
  motivo (`pedirCuenta` en el store) y un "Seguir sin cuenta" para volver. Si
  un invitado toca "Guardar lectura" e inicia sesión, esa lectura se guarda en
  su cuenta: queda apartada en `sessionStorage` (de esa pestaña, se borra al
  cerrarla) para sobrevivir a la recarga del inicio de sesión. Un invitado
  nunca escribe nada en localStorage.
- **Datos del usuario y privacidad:** los mazos propios, las tiradas, el
  historial y los rituales viven en la cuenta (base de datos) y el navegador
  guarda una copia en localStorage para que la app responda al instante. Esa
  copia **tiene dueño** (`ownerId`, el id de Clerk): al cerrar sesión se borra,
  y si otra persona inicia sesión en el mismo equipo, los datos del anterior
  se descartan antes de cargar nada; nunca se suben a la cuenta de otro. Los
  datos de antes de que existieran las cuentas (sin dueño) se suben una sola
  vez a la primera cuenta que inicie sesión. Ver `prepararSesion` y
  `limpiarDatosLocales` en `frontend/src/store/useReadingStore.ts`.
- **Pantalla Luna:** la fase se calcula en el dispositivo
  (`packages/tarot-core/src/lunar.ts`), sin red: fases principales con la
  serie de Meeus (cap. 49, con el término W de los cuartos, las correcciones
  planetarias y ΔT para pasar de TT a hora universal; a menos de un minuto de
  lo publicado) e iluminación real por elongación (Meeus cap. 47-48). El
  nombre de un día sigue la convención de los almanaques: una fase principal
  da nombre sólo al día local en que cae su instante (`lunaDelDia`), así que el
  mismo instante puede ser el 25 en Los Ángeles y el 26 en Roma. Las horas se
  muestran en la zona del dispositivo, al minuto y como aproximadas. Los
  retrógrados (JPL) y eclipses (IMCCE) vienen del backend; si fallan, el
  calendario lo dice y sigue con fases y festividades. Las festividades usan
  las fechas de la tradición del hemisferio norte, y la pantalla lo aclara.
- **Rituales:** se pueden atar a un día (`date`, `AAAA-MM-DD` local), a una
  fase y/o a una festividad, con instrucciones, materiales, notas y estado
  hecho/pendiente (`completedAt`). Las notas personales de cada festividad se
  guardan por año (`user_festival_notes`). Todo va a la cuenta: sin sesión
  se ofrece iniciar sesión, nunca se guarda en el navegador.
- **Motor de interpretación:** sigue siendo lógica 100% de frontend
  (`frontend/src/lib/interpretation.ts`), sin estado ni necesidad de
  servidor. Antes importaba las cartas de un archivo estático; ahora las
  recibe como parámetro (`cardsById`), alimentadas por la API a través de
  `useContentStore`.
- **Base de datos:** PostgreSQL en Neon (plan gratuito) + Prisma. Antes era
  SQLite, pero la app se publica en Vercel, que no tiene disco persistente:
  el archivo se perdía. Neon no requiere instalar nada en Windows y tiene
  ramas: una para desarrollo y `main` para producción. Ver
  [`docs/despliegue.md`](docs/despliegue.md).
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
| `DATABASE_URL` | PostgreSQL de Neon, cadena **con** pooler     | —                         |
| `DIRECT_URL`   | PostgreSQL de Neon, cadena **sin** pooler (migraciones) | —               |
| `PORT`         | Puerto de la API                              | `4000`                    |
| `FRONTEND_URL` | Origen permitido para CORS                    | `http://localhost:5173`   |
| `NODE_ENV`     | Entorno de ejecución                          | `development`             |

**frontend/.env**

| Variable       | Descripción       | Default                        |
| -------------- | ------------------ | ------------------------------- |
| `VITE_API_URL` | URL base de la API | `http://localhost:4000/api`     |

## Base de datos: migraciones y datos iniciales

```bash
npm run db:migrate    # aplica el esquema en la base de Neon de DATABASE_URL
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

## Despliegue

Frontend y API en Vercel (plan gratuito) y base de datos en Neon (plan
gratuito). Paso a paso en [`docs/despliegue.md`](docs/despliegue.md).

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

**Luna** (públicas)

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/moon/eclipses?anio=` | Eclipses lunares del año y del siguiente (IMCCE, cacheados) |
| GET | `/api/moon/estado` | Si hoy hay eclipse y cuál es el próximo |
| GET | `/api/moon/retrogrados?anio=` | Retrógrados planetarios del año (JPL, cacheados) |

`anio` es opcional (por defecto, el año actual) y tiene que estar entre 1900 y
2100; fuera de ese rango la API responde `400 ANIO_FUERA_DE_RANGO`.

**Validación:** los datos del usuario (mazos, tiradas, lecturas, rituales) se
validan antes de escribir; un campo que falta o con otro tipo responde 400
con el nombre del campo.

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
*upsert*: si el id no existe, lo crea. En los rituales, un campo opcional que
llega como `null` o vacío se borra; uno que no llega queda como estaba.

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/user/festival-notes?anio=` | Notas del usuario sobre festividades (de un año o de todos) |
| PUT | `/api/user/festival-notes/:festivalId/:anio` | Guarda la nota (`{ body }`); con texto vacío la borra |
| DELETE | `/api/user/festival-notes/:festivalId/:anio` | Borra la nota |

## Planes y límites

**Plan gratuito** (con cuenta): leer no tiene límite; lo que tiene tope es lo
que se guarda.

| Qué | Tope |
| --- | --- |
| Lecturas guardadas | 2 por semana (últimos 7 días), sin tope total |
| Mazos propios | 1 |
| Tiradas personalizadas | 2 |
| Rituales | 3 |

**Pro**: sin topes. Los invitados (sin cuenta) no guardan nada, así que no
tienen tope.

**El tope semanal** cuenta las veces que se *guardó* (tabla `usage_events`),
no las lecturas que existen: borrar una no devuelve el uso. Es una ventana
móvil de 7 días (`VENTANA_MS` en `plans.ts`), no la semana del calendario. El
`402` dice cuándo se puede volver a guardar.

**Administradores:** las cuentas con rol `admin` no tienen topes, aunque no
paguen (`esAdmin` en `services/limits.ts`). No ven la barra del plan ni la
ventana del Pro, y «Tu plan» dice «Administración».

**En el navegador**, lo que el servidor rechaza por el tope no queda guardado:
una lectura o un ritual con `402` sale del historial (antes quedaba en
localStorage y parecía guardado) y se abre la ventana «Pasa al Pro»
(`AvisoPro`, estado `avisoPro` del store). Si la pantalla ya sabe que el
usuario está en el tope, ni intenta guardar y abre la ventana directamente.
Al iniciar sesión, las lecturas que sólo están en el navegador se reenvían;
las que el servidor rechaza salen sin abrir la ventana.

**Lo que ve el usuario:** una barra fina bajo la cabecera, siempre visible
para quien tiene sesión y plan gratuito, con su uso de la semana y el botón
«Pasar al Pro» (`frontend/src/components/plans/LimitBanner.tsx`). Se vuelve
ámbar al llegar al tope. «Tu plan» muestra el detalle de los cuatro topes,
también cuando el pago todavía no está habilitado.

**El uso** sale de `GET /api/user/usage`, que existe siempre (con o sin
Stripe); `/api/billing/usage` devuelve lo mismo pero sólo existe con Stripe
configurado.

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

Los tests de integración del backend usan la base de `backend/.env` (la
rama de desarrollo de Neon, nunca la de producción) con usuarios propios que
se borran al terminar.

## Tecnologías

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Zustand, Framer Motion
- **Backend:** Node.js, Express, TypeScript
- **Base de datos:** PostgreSQL (Neon) + Prisma ORM
- **Hosting:** Vercel (frontend y API), plan gratuito

## Pendientes / mejoras futuras

- Panel de administración para editar cartas y tiradas desde una UI (la API ya soporta el CRUD completo).
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
