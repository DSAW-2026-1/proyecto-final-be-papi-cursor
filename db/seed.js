require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./connection');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Limpiar datos previos de seed (en orden por FK) ──────────────
    await client.query(`
      DELETE FROM reports; DELETE FROM notifications; DELETE FROM reviews;
      DELETE FROM messages; DELETE FROM conversations; DELETE FROM orders;
      DELETE FROM carts; DELETE FROM products;
      DELETE FROM users WHERE email IN ('comprador@unisabana.edu.co','vendedor@unisabana.edu.co','admin@unisabana.edu.co');
    `);

    // ── Usuario comprador ─────────────────────────────────────────────
    const buyerPassword = await bcrypt.hash('comprador123', 10);
    const buyerResult = await client.query(
      `INSERT INTO users (email, password, name, roles, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      ['comprador@unisabana.edu.co', buyerPassword, 'Comprador Demo', ['buyer']]
    );
    const buyer = buyerResult.rows[0];
    console.log('✅ Comprador creado:', buyer.email);

    // ── Usuario vendedor ──────────────────────────────────────────────
    const sellerPassword = await bcrypt.hash('vendedor123', 10);
    const sellerResult = await client.query(
      `INSERT INTO users (email, password, name, roles, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      ['vendedor@unisabana.edu.co', sellerPassword, 'Vendedor Demo', ['buyer', 'seller']]
    );
    const seller = sellerResult.rows[0];
    console.log('✅ Vendedor creado:', seller.email);

    // ── Producto del vendedor ─────────────────────────────────────────
    const productResult = await client.query(
      `INSERT INTO products (seller_id, name, description, price, stock, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [
        seller.id,
        'Cálculo Diferencial - Stewart 8va edición',
        'Libro en excelente estado, sin subrayados. Ideal para primer semestre de ingeniería.',
        45000,
        3
      ]
    );
    console.log('✅ Producto creado:', productResult.rows[0].name, '| stock:', productResult.rows[0].stock);

    // ── Usuario admin ─────────────────────────────────────────────────
    const adminPassword = await bcrypt.hash('admin123', 10);
    const adminResult = await client.query(
      `INSERT INTO users (email, password, name, roles, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      ['admin@unisabana.edu.co', adminPassword, 'Administrador', ['admin', 'buyer', 'seller']]
    );
    console.log('✅ Admin creado:', adminResult.rows[0].email);

    await client.query('COMMIT');
    console.log('\n✅ Seed completado exitosamente.');
    console.log('─────────────────────────────────────');
    console.log('Comprador  → comprador@unisabana.edu.co / comprador123');
    console.log('Vendedor   → vendedor@unisabana.edu.co  / vendedor123');
    console.log('Admin      → admin@unisabana.edu.co     / admin123');
    console.log('─────────────────────────────────────');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

// ✅ db/seed.js — completado
