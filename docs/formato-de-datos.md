# Formato de los archivos de Arcana (exportar e importar)

Lo que se descarga desde **Tu cuenta → Tus datos → Exportar**, desde el ⇩
de un mazo, una tirada o el historial, es un archivo JSON con esta forma.
El mismo formato es el que acepta **Importar**, así que un mazo se puede
escribir a mano (o generar con otra herramienta) y cargarlo en la app.

## Estructura general

```json
{
  "format": "arcana-archive",
  "version": 2,
  "exportedAt": "2026-10-24T18:00:00.000Z",
  "decks": [],
  "spreads": [],
  "readings": [],
  "rituals": []
}
```

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `format` | sí | Siempre `"arcana-archive"`. Sin esto el archivo se rechaza. |
| `version` | sí | Versión del formato. La actual es `2`. Un archivo `1` (sin rituales) se acepta; uno de una versión mayor, no. |
| `exportedAt` | no | Fecha de exportación (ISO 8601). Es informativa. |
| `decks` | no | Mazos propios. Si falta, cuenta como lista vacía. |
| `spreads` | no | Tiradas propias. |
| `readings` | no | Lecturas del historial. |
| `rituals` | no | Rituales (desde la versión 2). |

Cada elemento de cada lista necesita un `id` de texto; los que no lo tienen se
descartan al importar. Lo que ya existe en la cuenta (mismo `id`) no se
duplica.

## Un mazo

```json
{
  "format": "arcana-archive",
  "version": 2,
  "decks": [
    {
      "id": "deck_oraculo_luna",
      "name": "Oráculo de la Luna",
      "description": "Mi oráculo de 3 cartas",
      "allowReversed": false,
      "createdAt": 1792860000000,
      "updatedAt": 1792860000000,
      "cards": [
        {
          "id": "card_sanadora",
          "name": "La Sanadora",
          "glyph": "✚",
          "imageUrl": "https://ejemplo.com/cartas/sanadora.jpg",
          "subtitle": "1 · Agua",
          "keywords": ["cuidado", "alivio"],
          "reversedKeywords": ["agotamiento"],
          "upright": "Es momento de cuidar y dejarte cuidar.",
          "reversed": "Das tanto que te quedas sin reservas.",
          "advice": "Pide ayuda antes de necesitarla.",
          "loveHint": "Un vínculo que necesita cuidado de los dos lados.",
          "workHint": "Un equipo que te pide más de lo que puedes dar.",
          "moneyHint": "Gastos de bienestar que valen la pena.",
          "healthHint": "Descanso antes que esfuerzo.",
          "yesNo": "si",
          "yesNoReason": "Sí, si te cuidas en el proceso.",
          "element": "agua",
          "energy": "receptiva",
          "axis": "vinculo"
        },
        { "id": "card_lobo", "name": "Lobo", "glyph": "☾" },
        { "id": "card_mar", "name": "Mar" }
      ]
    }
  ]
}
```

### Campos del mazo

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `id` | sí | Identificador único, texto. |
| `name` | sí | Nombre del mazo. |
| `description` | no | Descripción corta. |
| `allowReversed` | no | `true` si las cartas se pueden leer invertidas. Si falta, `true`. |
| `cards` | sí | Lista de cartas. Las que no tienen `name` se descartan al importar. |
| `createdAt`, `updatedAt` | no | Fechas en milisegundos. Si faltan, la app pone la fecha de la importación. |

### Campos de cada carta

Sólo `name` es obligatorio (si falta `id`, la app le pone uno). Lo que falte
se resuelve solo en la lectura.

| Campo | Qué es |
| --- | --- |
| `id` | Identificador único dentro del mazo. Recomendado: si lo cambias, las lecturas guardadas pierden la referencia a la carta. |
| `name` | Nombre de la carta. |
| `glyph` | Símbolo de 1 o 2 caracteres. Es lo que se dibuja si no hay imagen. |
| `imageUrl` | **Imagen de la carta**: dirección `https://` directa a un archivo de imagen (jpg, png, webp…), de hasta 2048 caracteres. Ver abajo. |
| `subtitle` | Texto libre: número, palo, correspondencia. |
| `keywords` | Palabras clave al derecho (lista de textos). |
| `reversedKeywords` | Palabras clave invertida. |
| `upright` | Significado al derecho. |
| `reversed` | Significado invertida. |
| `advice` | Consejo breve. |
| `loveHint` | Qué dice la carta sobre el **amor**. |
| `workHint` | Qué dice sobre el **trabajo** o la carrera. |
| `moneyHint` | Qué dice sobre el **dinero**. |
| `healthHint` | Qué dice sobre la **salud**. |
| `yesNo` | Respuesta a una pregunta de sí o no: `si`, `no` o `incierto`. |
| `yesNoReason` | Por qué responde eso (frase corta). |
| `element` | `fuego`, `agua`, `aire` o `tierra`. |
| `energy` | `activa`, `receptiva` o `transformadora`. |
| `axis` | `inicio`, `voluntad`, `intuicion`, `vinculo`, `estructura`, `transicion`, `sombra` o `plenitud`. |

`element`, `energy` y `axis` son opcionales y sirven para que la lectura
detecte patrones (por ejemplo, «mayoría de agua»).

## Temas de la pregunta y Sí/No

Al hacer una lectura se elige el tema de la pregunta: general, amor, trabajo,
dinero o salud. Si la carta tiene texto para ese tema, la lectura lo agrega
después del significado («En el plano del amor: …»). Con tema general, o si la
carta no tiene texto para ese tema, se lee sólo el significado al derecho o
invertida. Es lo mismo que hace el mazo Rider-Waite.

`yesNo` aparece como etiqueta (Sí, No o Incierto) junto a la carta en el
resultado; `yesNoReason` se ve al pasar el mouse sobre la etiqueta.

Los textos por tema no cambian con la orientación: valen igual al derecho que
invertida.

**Nombres de otras apps.** Al importar se aceptan también los nombres en
inglés que usan muchas guías de mazos, y se pasan solos a los de Arcana:

| Si el archivo trae | Se guarda como |
| --- | --- |
| `love` (o `amor`) | `loveHint` |
| `career`, `work` (o `trabajo`) | `workHint` |
| `money`, `finance`, `finances` (o `dinero`) | `moneyHint` |
| `health` (o `salud`) | `healthHint` |
| `yesNo: "yes"`, `"maybe"`, `"sí"`, `"quizás"` | `yesNo: "si"` / `"incierto"` |

Un `yesNo` con otro valor se ignora.

## Imágenes de las cartas (`imageUrl`)

- La imagen **no se sube** a Arcana: la carta guarda sólo la dirección. El
  archivo sigue estando donde lo tengas (tu web, un servicio de imágenes, etc.).
- Tiene que empezar con `https://`. Las direcciones `http://` se rechazan
  porque el navegador las bloquea en una página segura, y las `data:` (la
  imagen pegada dentro del texto) también, porque llenarían la base de datos.
- Tiene que ser el enlace **directo** a la imagen, no a la página que la
  muestra. En el navegador: clic derecho sobre la imagen → «Copiar dirección
  de la imagen».
- Los enlaces para compartir de **Google Drive**, **Dropbox** e **Imgur** se
  convierten solos al enlace directo. En Drive, el archivo tiene que estar
  compartido como «Cualquier persona con el enlace».
- Pinterest, Instagram y otras redes no dejan usar sus imágenes desde otras
  páginas: ahí la carta se queda con el símbolo.
- Si la imagen no carga (se borró, o el sitio no deja usarla desde otras
  páginas), la carta se dibuja con su `glyph`, como si no tuviera imagen.
- Al importar, una `imageUrl` inválida se quita y la carta se importa igual,
  con su símbolo. El servidor rechaza (error 400) un mazo que llegue con una
  `imageUrl` inválida por la API.
- El PDF de la lectura sigue usando el símbolo en las cartas de mazos propios:
  el servidor no descarga imágenes de direcciones que escriben los usuarios.

El campo es opcional y se agregó sin cambiar la versión del formato: un
archivo sin imágenes es idéntico al de antes, y una versión anterior de la app
simplemente ignora `imageUrl`.

## Tiradas, lecturas y rituales

Tienen la misma forma con la que la app los guarda. Lo más práctico para
armarlos a mano es crear uno en la app, exportarlo y usar ese archivo como
plantilla.
