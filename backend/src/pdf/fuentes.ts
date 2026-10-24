/* ==========================================================================
   Fuentes estándar de pdfkit que usa el PDF (ver `FONT` en layout.ts).

   pdfkit carga cada fuente estándar con un `require` armado en tiempo de
   ejecución (`#standard-fonts/Helvetica`). En local funciona, pero Vercel
   sólo sube a la función los archivos que puede ver requeridos al analizar el
   código, y ese `require` dinámico no lo ve: en producción el PDF fallaba con
   «Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs».

   Requerirlas acá con su nombre fijo hace que Vercel las incluya. Si se usa
   otra fuente estándar en el PDF (por ejemplo Times-Roman), hay que agregarla
   también.
   ========================================================================== */
import 'pdfkit/standard-fonts/Helvetica';
import 'pdfkit/standard-fonts/HelveticaBold';
import 'pdfkit/standard-fonts/HelveticaOblique';
