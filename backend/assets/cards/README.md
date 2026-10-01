# Imágenes de las cartas

Acá van los archivos de imagen. La base guarda **sólo el nombre**, y la
columna `Card.image` lo apunta.

## Cómo se sube una

```bash
npx tsx tools/importarImagenes.ts la-torre.jpg
```

El script copia el archivo con el nombre del id de la carta y deja el campo
`image` anotado. Después la app y el PDF la usan sola.

## Qué formato y cuánto

- **JPEG** o **PNG** o **WebP**. El JPEG pesa menos para el mismo dibujo.
- **Hasta 400 kB.** Una carta a 150 dpi no pasa de 30 kB: en el PDF mide 1,1
  pulgadas de ancho. Si el archivo pesa mucho es que la imagen es mucho más
  grande de lo que se usa, y se nota en la descarga.
- Idealmente **200 px de ancho** o un poco más. Más píxeles no se ven.

## De dónde pueden salir

El arte original de Pamela Colman Smith (1909) es de dominio público en
Estados Unidos desde hace décadas y en Reino Unido y Europa desde el
1 de enero de 2022. Se puede usar y vender.

Lo que **no** suele ser libre: los escaneos coloreados que se encuentran
online. Casi todos son obra moderna con su propio copyright. Del original en
blanco y negro se puede pasar a color: eso es una obra derivada y es libre, si
lo hacés vos.

Y el nombre "Rider-Waite" es marca registrada, así que en la interfaz dice
"Tarot clásico".
