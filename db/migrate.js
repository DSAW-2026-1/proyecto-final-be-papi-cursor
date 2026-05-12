require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./connection');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // orden alfabético: 001, 002, ...

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`⏳ Ejecutando ${file}...`);
      await client.query(sql);
      console.log(`✅ ${file} — completado`);
    }
    console.log('\n✅ Todas las migraciones ejecutadas correctamente.');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

// ✅ db/migrate.js — completado
