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

## Pendientes

### Importantes

- [ ] **7. La firma del webhook de Clerk se verifica sobre el JSON
  re-serializado** (`JSON.stringify(req.body)` en `webhook.ts`). Svix firma
  los bytes exactos: hay que usar el cuerpo crudo con `raw()`.
- [ ] **8. Una cuenta con el mismo email hereda la fila, rol admin incluido**
  (`resolveUser` en `middleware/clerk.ts`). Exigir email verificado.
- [ ] **9. Borrar un usuario no cancela su suscripción en Stripe**, y
  `resolveUser` lo vuelve a crear si sigue existiendo en Clerk.
- [ ] **10. `backend/.env` y `backend/prisma/dev.db` no están en
  `.gitignore`.** Hoy no están en git, pero un `git add .` subiría las claves
  y los datos de los usuarios.

### Menores

- [ ] `/api/moon/eclipses` y `/retrogrados` aceptan cualquier año `> 1000`
  sin tope: permiten forzar llamadas al IMCCE/JPL y llenar `AstronomyCache`.
- [ ] Sin validación de entrada en los `create*` de `userService`: un campo
  faltante da 500 en vez de 400.
- [ ] Comentario desactualizado en `plans.ts` ("con 20 lecturas"; el tope es 10).
- [x] El aviso de `billing.routes.ts` nombraba `STRIPE_PRO_PRICE_ID`, que ya
  no existe.
- [ ] La regex de caracteres de control de `cardImages.ts` tiene bytes
  invisibles en el fuente; escribirla como `/[\x00-\x1f\x7f]/`.
- [ ] Los PDF de ejemplo siguen en git aunque `.gitignore` los excluye
  (`git rm --cached backend/*.pdf`).
- [ ] `listUserReadings` devuelve como máximo 100 lecturas y no pagina.
