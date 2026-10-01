# Cobro con Stripe: puesta en marcha

Estado actual: el código está completo y verificado con 48 tests, pero **nunca
se probó contra la API real de Stripe**. Esta es la lista para hacerlo.

## Qué falta

Sólo tres valores en `backend/.env`. La app arranca igual sin ellos, en plan
gratuito, y avisa por consola:

```
[billing] Stripe sin configurar: el cobro queda deshabilitado...
```

Eso es intentional, no un error.

---

## 1. Crear la cuenta

https://dashboard.stripe.com/register

Importante: activá el **modo de prueba**. En la esquina superior derecha hay un
toggle. Con una cuenta sin datos bancarios no podés crear productos de pago.

## 2. Sacar la clave secreta

Dashboard → Developers → API keys. Copiá la que empieza con `sk_test_`.

Nunca la de producción mientras estés probando: `sk_live_` cobra dinero real.

## 3. Crear los TRES precios

Dashboard → Products → Add product. Un producto ("Arcana Pro") con tres
precios:

| Precio | Cómo | Para qué variable |
| --- | --- | --- |
| Mensual | Recurrente, cada mes | `STRIPE_MONTHLY_PRICE_ID` |
| Anual | Recurrente, cada año | `STRIPE_ANNUAL_PRICE_ID` |
| De por vida | **Una sola vez** | `STRIPE_LIFETIME_PRICE_ID` |

Copiá el `price_...` de cada uno.

> **Que empiece con `price_`, no con `prod_`.** El product id identifica el
> producto y el price id identifica el precio. Si ponés un `prod_` donde va un
> `price_`, **no da ningún error**: el backend compara el precio de cada item
> contra ese valor, la comparación nunca coincide, el usuario paga y queda en
> gratuito, y no hay ningún aviso. Es el error más caro de esta sección
> justamente porque es invisible.

El de por vida tiene que ser un precio de **pago único**. No se puede
configurar como recurrente: el checkout de suscripción de Stripe rechaza los
precios que no se renuevan, así que el código tiene un camino aparte para ese.

## 3 bis. El período de prueba

`STRIPE_TRIAL_DAYS=7` en el `.env`. Va en el mensual y el anual. El de por
vida no puede tener prueba: no hay nada que renovar cuando termine.

La prueba **pide la tarjeta igual**. Stripe cobra al final de los 7 días, así
que sin tarjeta el usuario tiene 7 días de Pro sin límites y después cae al
plan gratuito sin haberte pagado nada. Pedirla al principio es lo honesto.

## 4. Probar el webhook en local

La app corre en `http://localhost:4000`, pero Stripe no puede llegar ahí. Se
usa la CLI de Stripe, que abre un túnel y te da una clave de firma local.

Instalar: https://docs.stripe.com/stripe-cli

```bash
stripe login
stripe listen --forward-to localhost:4000/webhooks/stripe
```

Copiá el `whsec_...` que imprime y ponelo como `STRIPE_WEBHOOK_SECRET`.

**Ojo:** es una clave distinta a la del dashboard. La de la CLI vale sólo para
eventos que tú dispares con `stripe trigger`; no sirve en producción.

## 5. Poner's las tres variables

En `backend/.env`:

```
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_MONTHLY_PRICE_ID="price_..."
STRIPE_ANNUAL_PRICE_ID="price_..."
STRIPE_LIFETIME_PRICE_ID="price_..."
STRIPE_TRIAL_DAYS=7
```

Reiniciá el backend. El aviso `[billing] Stripe sin configurar` tiene que
desaparecer.

---

## Cómo probar que anda, sin tocar la app a mano

Con `stripe listen` corriendo en una terminal, en otra:

```bash
# 1. El usuario hace el checkout desde la app (menú de cuenta → Pasar al Pro)
# 2. Completá el pago con la tarjeta de prueba 4242 4242 4242 4242

# 3. Forzar el evento aunque no se haya completado el pago todavía:
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

La tarjeta `4242 4242 4242 4242` es de prueba: no cobra, siempre aprueba.

Para probar el fallo de tarjeta (que es el caso de `past_due`):

```
4000 0000 0000 0341
```

Esa **falla siempre**, que es lo que sirve.

## Qué mirar para saber que funcionó

```bash
# En el backend, la fila tiene que decir plan=pro
sqlite3 backend/prisma/dev.db "SELECT plan, status, currentPeriodEnd FROM subscriptions;"
```

Y en la terminal de `stripe listen`, cada evento debería salir con
`--> 200` en la última línea. Si sale `400`, la firma no coincidió.

---

## Cosas que ya están verificadas y no hace falta probar

- **La firma del webhook.** Se prueba con la criptografía real de la librería de
  Stripe: se genera una firma válida y se verifica que el código la acepta, que
  rechaza un cuerpo adulterado y que rechaza otro secreto. 10 tests en
  `backend/src/__tests__/webhookSignature.test.ts`.
- **La escritura en la base.** `syncSubscription` contra la base real: crea la
  fila, deduplica reintentos, actualiza estados, y no se confunde entre dos
  usuarios. 8 tests.
- **`current_period_end` sale del item**, no de la suscripción. Ya se movió
  adentro del item; hay un test que falla si vuelve al lugar viejo.
- **`past_due` conserva el acceso.** El mes ya está pagado.
- **La app con el cobro apagado.** Las cinco rutas dan 404 (no 401), el resto
  de la API sigue contestando, y el plan gratuito se calcula igual. 10 tests.
- **El Pro de por vida.** 13 tests: que conceda, y sobre todo que NO conceda
  ante un pago de otro precio, una suscripción mensual, una sesión sin
  items, o una compra que no se puede atribuir a nadie. Y que un webhook
  atrasado de una suscripción vieja no le saque el Pro a alguien que ya pagó
  de por vida.

## Lo único que no se puede testear sin esta cuenta

Que el checkout se cree de verdad en Stripe, que el pago se procese, y que los
eventos lleguen al endpoint. Todo lo demás ya está cubierto.
