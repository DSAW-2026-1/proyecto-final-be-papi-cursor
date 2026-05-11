require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./connection');

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '001_initial_schema.sql'), 'utf8'
  );
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Migración ejecutada correctamente.');
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
