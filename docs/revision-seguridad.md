# Revisión de seguridad y robustez

Revisión del backend (rutas, middleware, Stripe, Clerk y servicios) y de la
parte del frontend que habla con la API, hecha el 22/10/2026. Cada punto
indica el problema, dónde está y su estado.

## Resueltos

### 1. Escritura del contenido editorial sin autenticación — grave

`POST`, `PUT` y `DELETE` de `/api/cards`, `/api/spreads` y
`/api/combinations` no pedían sesión: cualquiera podía borrar o reescribir
una carta con un `curl`, rompiendo las lecturas y los PDF de todos.

**Solución:** `requireAdmin` en las tres rutas de escritura de cada router
(`backend/src/routes/{cards,spreads,combinations}.routes.ts`). Los `GET`
siguen siendo públicos.

### 2. Un usuario en su tope tumbaba el servidor — grave

`enforceLimit` y `requirePro` eran middleware async sin `asyncHandler`.
Express 4 no captura los rechazos de las funciones async: el `throw` del 402
quedaba como promesa rechazada sin manejar y Node terminaba el proceso.

**Solución:** los dos middleware de `backend/src/middleware/planLimits.ts`
devuelven `asyncHandler(...)`, así que el error llega al `errorHandler` y
sale como un 402 normal.

### 3. Los límites del plan gratuito se saltaban con PUT — grave

Los `PUT /api/user/{decks,spreads,rituals}/:id` crean si el id no existe y
no pasaban por `enforceLimit`: con ids nuevos, el plan gratuito no tenía
tope.

**Solución:** la comprobación se movió a `assertCanCreate` en
`backend/src/services/limits.ts`. La usan el middleware del `POST` y la rama
de creación de los tres upsert de `userService.ts`. Editar lo existente sigue
permitido en el tope.

**Tests:** `backend/src/__tests__/planLimits.test.ts` (20 tests) cubre los
tres puntos.

### 4. El webhook de Stripe perdía eventos — grave

`stripeWebhook.routes.ts` respondía 200 aunque el procesamiento fallara, así
que Stripe no reintentaba. En el pago de por vida, el usuario pagaba y no
recibía nada.

**Solución:** un error de procesamiento se registra y se relanza: el
`errorHandler` responde 500 y Stripe reintenta durante tres días. Es seguro
porque todo es idempotente. Además, los eventos `customer.subscription.*`
ahora sincronizan el estado actual pedido a la API, porque Stripe no garantiza
el orden de entrega.

### 5. El de por vida se concedía sin comprobar el cobro — importante

**Solución:** `grantLifetime` exige `payment_status` `paid` (o
`no_payment_required`, un cupón del 100 %). Los pagos diferidos se conceden
con `checkout.session.async_payment_succeeded`. Nuevo `revokeLifetime`: un
reembolso total (`charge.refunded`) o una disputa perdida
(`charge.dispute.closed` con estado `lost`) devuelven al usuario a gratuito,
siempre que el cobro sea el de la compra de por vida.

### 6. Un evento atrasado de una suscripción vieja pisaba la activa — importante

**Solución:** `syncSubscription` ignora un evento de otra suscripción ya
muerta cuando la guardada sigue vigente. Una suscripción nueva y viva sí la
reemplaza.

**Tests:** `lifetime.test.ts` (6 tests nuevos) y `billingWebhook.test.ts`
(8 tests).

> **Acción en el panel de Stripe:** activar en el endpoint del webhook los
> eventos nuevos `checkout.session.async_payment_succeeded`,
> `checkout.session.async_payment_failed`, `charge.refunded` y
> `charge.dispute.closed` (ver `docs/stripe.md`).

### 7. La firma del webhook de Clerk se verificaba sobre JSON re-armado — importante

**Solución:** `routes/webhook.ts` recibe el cuerpo crudo (`raw`) y se monta en
`app.ts` antes de `express.json()`, igual que el de Stripe. Firma inválida →
400; error al procesar → 500, para que Svix reintente.

### 8. Una cuenta nueva heredaba la fila de otra por email — importante

**Solución:** nuevo `services/accounts.ts` con `sincronizarUsuario`, que usan
tanto `requireAuth` como el webhook. Sólo un email **verificado** identifica a
una persona; una cuenta nueva con el mismo email verificado reutiliza la fila,
pero el rol de admin no se hereda (queda `user` y se vuelve a dar a mano).

### 9. Borrar un usuario no cancelaba su cobro — importante

**Solución:** `borrarCuenta` cancela primero la suscripción en Stripe
(`cancelSubscriptionForDeletedUser`), después borra la cuenta en Clerk (sólo
desde el panel; desde el webhook `user.deleted` ya no existe) y por último la
fila. Si Stripe falla, no se borra nada. El panel ya no permite borrarse ni
quitarse el admin a uno mismo.

**Tests:** `backend/src/__tests__/accounts.test.ts` (12 tests).

### 11. El historial del navegador no tenía dueño — grave (privacidad)

Encontrado al probar la app. Los datos guardados en el navegador (historial,
mazos, tiradas, rituales) no indicaban de qué cuenta eran:

- seguían visibles después de cerrar sesión (el contador del historial);
- si otra persona iniciaba sesión en el mismo equipo, `migrateLocalData` los
  subía **a la cuenta de esa persona**.

**Solución:** el store guarda `ownerId` junto con los datos.
`prepararSesion(userId)` corre al iniciar sesión **antes** de migrar: si los
datos son de otra cuenta, se descartan. Al cerrar sesión (o si la sesión
expira) `limpiarDatosLocales` los borra; el menú avisa antes si quedan cambios
sin subir. Sin sesión, el contador del historial no se muestra. Los datos sin
dueño (de antes de las cuentas) se adoptan una sola vez.

**Tests:** `frontend/src/__tests__/privacidad.test.ts` (4 tests).

Relacionado: con el **modo invitado** (la app se usa sin cuenta), un invitado
no escribe nada en el navegador; la lectura que quiere guardar se aparta en
`sessionStorage` de esa pestaña hasta que inicia sesión. Tests en
`frontend/src/__tests__/modoInvitado.test.ts` (7 tests).

## Pendientes

### Importantes

- [ ] **10. `backend/.env` y `backend/prisma/dev.db` entraron en git y se
  subieron a GitHub** (commit «first commit: tarot app», 22/10/2026).
  - [x] `.gitignore` los excluye (`backend/.env`, `.env`, `backend/prisma/*.db`).
  - [x] Sacarlos del repositorio sin borrarlos del disco:
    `git rm --cached backend/.env backend/prisma/dev.db`, commit y push.
  - [ ] Antes de hacer público el repositorio o sumar colaboradores: rotar
    las claves que había en `backend/.env` (Stripe y Clerk: secret keys y
    signing secrets de webhooks). Siguen en el historial de git; hoy el
    repositorio es privado y de un solo usuario, así que el riesgo es bajo.

### Menores

- [x] `/api/moon/eclipses` y `/retrogrados` aceptaban cualquier año `> 1000`.
  Ahora sólo 1900–2100 (`ANIO_MIN`/`ANIO_MAX` en `moon.routes.ts`); fuera de
  rango, 400 `ANIO_FUERA_DE_RANGO`. El frontend ya trataba los errores como
  "sin datos".
- [x] Validación de entrada en `userService` (mazos, tiradas, lecturas y
  rituales, también en los PUT): un campo que falta o con otro tipo da 400 con
  el nombre del campo, en vez de un 500 de Prisma.
- [x] Comentarios rotos o desactualizados: «con 20 lecturas» en `plans.ts` (el
  tope es 10) y palabras sueltas en otro idioma o mal escritas en `plans.ts`,
  `billingService.ts`, `billingController.ts`, `eclipses.ts`, `pdf/carta.ts`,
  `pdf/moon.ts`, `schema.prisma`, `webhookSignature.test.ts`, `MoonDisc.tsx`,
  `api.ts` y `docs/stripe.md`.
- [x] El aviso de `billing.routes.ts` nombraba `STRIPE_PRO_PRICE_ID`, que ya
  no existe.
- [x] La regex de caracteres de control de `cardImages.ts` tenía bytes
  invisibles en el fuente; ahora es `/[\x00-\x1f\x7f]/`.
- [x] `listUserReadings` cortaba en 100 lecturas: un Pro dejaba de ver las
  viejas. Ahora devuelve todas.
- [ ] Los PDF de ejemplo siguen en git aunque `.gitignore` los excluye:
  `git rm --cached backend/ejemplo-crucelta.pdf backend/ejemplo-tres-cartas.pdf`.

**Tests:** `backend/src/__tests__/inputValidation.test.ts` (13 tests).
