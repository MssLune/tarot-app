/* La función de Vercel: el backend entero, empaquetado por
   scripts/empaquetar.mjs. Express es un handler (req, res) válido, así que se
   exporta tal cual. Todas las rutas llegan acá por el rewrite de vercel.json. */
const { app } = require('../dist-vercel/app.cjs');

module.exports = app;
