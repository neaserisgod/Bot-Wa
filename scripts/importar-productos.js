// Importa el catálogo de productos desde un CSV a la tabla productos (Fase 4).
//
// Formato del archivo (separador ';', que es el que usa Excel en Argentina):
//
//   nombre;precio;palabras_clave
//   Coca Cola 1.5L;1200;coca,cocacola,coca cola
//   Jamón cocido;3500;jamon
//   Pan;800;pan
//
// La primera línea puede ser el encabezado (se detecta y se saltea).
// palabras_clave usa comas internamente; por eso el separador de campos es ';'.
//
// Uso:  node scripts/importar-productos.js [ruta-del-csv]
// Default: data/productos.csv
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { ejecutarMigraciones } = require('../src/db/migrations');
const productosQueries = require('../src/db/queries/productos');
const { parsearMonto } = require('../src/utils/validadores');

function main() {
  const rutaCsv = process.argv[2] || path.join('data', 'productos.csv');

  if (!fs.existsSync(rutaCsv)) {
    console.error(`No encontré el archivo: ${rutaCsv}`);
    console.error('Creá un CSV con columnas: nombre;precio;palabras_clave');
    process.exit(1);
  }

  ejecutarMigraciones(db);

  const contenido = fs.readFileSync(rutaCsv, 'utf8');
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim() !== '');

  let importados = 0;
  let ignorados = 0;

  for (const [indice, linea] of lineas.entries()) {
    const campos = linea.split(';').map((c) => c.trim());

    // Saltea el encabezado si la primera línea no tiene un precio numérico.
    if (indice === 0 && parsearMonto(campos[1]) === null) continue;

    const [nombre, precioTexto, palabrasClave = ''] = campos;
    const precio = parsearMonto(precioTexto);

    if (!nombre || precio === null) {
      console.warn(`Línea ignorada (nombre o precio inválido): "${linea}"`);
      ignorados += 1;
      continue;
    }

    productosQueries.crear({
      nombre,
      precio,
      palabrasClave: palabrasClave || null,
    });
    importados += 1;
  }

  console.log(`✅ Importación lista: ${importados} productos cargados, ${ignorados} ignorados.`);
  console.log(`Total activos en catálogo: ${productosQueries.contar()}`);
}

main();
