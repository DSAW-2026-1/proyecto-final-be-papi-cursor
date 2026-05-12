// Base de datos PostgreSQL
// Conexión via DATABASE_URL (ver .env / variables de entorno en Vercel)
const pool = require('./db/connection');

// ── Helpers ──────────────────────────────────────────────────────────────────

// snake_case → camelCase para convertir filas de pg al formato que usan las rutas
const toCamel = (r) => {
  if (!r) return null;
  const out = {};
  for (const k of Object.keys(r)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = r[k];
  }
  return out;
};

const rows = (result) => result.rows.map(toCamel);
const row  = (result) => toCamel(result.rows[0] ?? null);

// camelCase → columna SQL
const COL = {
  isActive:               'is_active',
  sellerId:               'seller_id',
  buyerId:                'buyer_id',
  productId:              'product_id',
  orderId:                'order_id',
  conversationId:         'conversation_id',
  senderId:               'sender_id',
  lastMessageAt:          'last_message_at',
  updatedAt:              'updated_at',
  resolvedAt:             'resolved_at',
  sellerConfirmedPayment: 'seller_confirmed_payment',
  buyerConfirmedReceipt:  'buyer_confirmed_receipt',
  createdAt:              'created_at',
  userId:                 'user_id',
  reportedBy:             'reported_by',
  targetType:             'target_type',
  targetId:               'target_id',
  suspendedUntil:         'suspended_until',
  hidden:                 'hidden',
};

const buildSet = (updates, offset = 1) => {
  const keys   = Object.keys(updates);
  const clause = keys.map((k, i) => `${COL[k] || k} = $${i + offset}`).join(', ');
  const values = keys.map(k => updates[k]);
  return { clause, values };
};

// ── API de base de datos (todos los métodos son async) ───────────────────────

const database = {

  // ── Usuarios ──────────────────────────────────────────────────────────────
  users: {
    findByEmail: async (email) => {
      const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return row(r);
    },
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return row(r);
    },
    create: async (user) => {
      const r = await pool.query(
        `INSERT INTO users (id, email, password, name, roles, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [user.id, user.email, user.password, user.name,
         user.roles, user.status || 'active', user.createdAt || new Date()]
      );
      return row(r);
    },
    getAll: async () => {
      const r = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return rows(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE users SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    },
    delete: async (id) => {
      // Elimina registros dependientes primero para evitar FK violations
      await pool.query('DELETE FROM orders WHERE buyer_id=$1 OR seller_id=$1', [id]);
      await pool.query('DELETE FROM carts WHERE user_id=$1', [id]);
      await pool.query('DELETE FROM notifications WHERE user_id=$1', [id]);
      await pool.query('DELETE FROM reports WHERE reported_by=$1', [id]);
      await pool.query('DELETE FROM messages WHERE sender_id=$1', [id]);
      const r = await pool.query('DELETE FROM users WHERE id=$1 RETURNING *', [id]);
      return row(r);
    }
  },

  // ── Productos ─────────────────────────────────────────────────────────────
  products: {
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      return row(r);
    },
    findBySeller: async (sellerId) => {
      const r = await pool.query('SELECT * FROM products WHERE seller_id = $1', [sellerId]);
      return rows(r);
    },
    getAll: async () => {
      const r = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
      return rows(r);
    },
    create: async (product) => {
      const r = await pool.query(
        `INSERT INTO products
           (id, seller_id, name, description, price, stock, is_active,
            image, category, condition, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [product.id, product.sellerId, product.name, product.description,
         product.price, product.stock ?? 0, product.isActive ?? true,
         product.image || null, product.category || null,
         product.condition || null,
         product.createdAt || new Date(), new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE products SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    },
    delete: async (id) => {
      const r = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      return row(r);
    }
  },

  // ── Carritos ──────────────────────────────────────────────────────────────
  carts: {
    findByUser: async (userId) => {
      const r = await pool.query('SELECT * FROM carts WHERE user_id = $1', [userId]);
      return row(r);
    },
    create: async (cart) => {
      const r = await pool.query(
        `INSERT INTO carts (id, user_id, items, updated_at)
         VALUES ($1,$2,$3,NOW()) RETURNING *`,
        [cart.id, cart.userId, JSON.stringify(cart.items || [])]
      );
      return row(r);
    },
    update: async (userId, updates) => {
      const r = await pool.query(
        `UPDATE carts SET items = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`,
        [JSON.stringify(updates.items), userId]
      );
      return row(r);
    },
    delete: async (userId) => {
      const r = await pool.query('DELETE FROM carts WHERE user_id = $1 RETURNING *', [userId]);
      return row(r);
    }
  },

  // ── Órdenes ───────────────────────────────────────────────────────────────
  orders: {
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
      return row(r);
    },
    findByBuyer: async (buyerId) => {
      const r = await pool.query(
        'SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC', [buyerId]
      );
      return rows(r);
    },
    findBySeller: async (sellerId) => {
      const r = await pool.query(
        'SELECT * FROM orders WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]
      );
      return rows(r);
    },
    getAll: async () => {
      const r = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      return rows(r);
    },
    create: async (order) => {
      const r = await pool.query(
        `INSERT INTO orders
           (id, buyer_id, seller_id, items, total, status,
            seller_confirmed_payment, buyer_confirmed_receipt, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [order.id, order.buyerId, order.sellerId,
         JSON.stringify(order.items || []), order.total,
         order.status || 'pending',
         order.sellerConfirmedPayment || false,
         order.buyerConfirmedReceipt  || false,
         order.createdAt || new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      if (updates.status === 'completed') {
        const current = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        const o = row(current);
        const sellerOk = updates.sellerConfirmedPayment ?? o.sellerConfirmedPayment;
        const buyerOk  = updates.buyerConfirmedReceipt  ?? o.buyerConfirmedReceipt;
        if (!sellerOk || !buyerOk) {
          throw new Error('Una orden solo puede ser completed cuando ambas partes confirman.');
        }
      }
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE orders SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    }
  },

  // ── Conversaciones ────────────────────────────────────────────────────────
  conversations: {
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
      return row(r);
    },
    findByUsers: async (user1Id, user2Id) => {
      const r = await pool.query(
        `SELECT * FROM conversations
         WHERE (buyer_id=$1 AND seller_id=$2) OR (buyer_id=$2 AND seller_id=$1) LIMIT 1`,
        [user1Id, user2Id]
      );
      return row(r);
    },
    findByUser: async (userId) => {
      const r = await pool.query(
        `SELECT * FROM conversations
         WHERE buyer_id=$1 OR seller_id=$1
         ORDER BY last_message_at DESC NULLS LAST`,
        [userId]
      );
      return rows(r);
    },
    create: async (conv) => {
      const r = await pool.query(
        `INSERT INTO conversations (id, buyer_id, seller_id, product_id, last_message_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [conv.id, conv.buyerId, conv.sellerId, conv.productId || null,
         conv.lastMessageAt || null, conv.createdAt || new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE conversations SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    }
  },

  // ── Mensajes ──────────────────────────────────────────────────────────────
  messages: {
    findByConversation: async (conversationId) => {
      const r = await pool.query(
        'SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC',
        [conversationId]
      );
      return rows(r);
    },
    create: async (msg) => {
      const r = await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [msg.id, msg.conversationId, msg.senderId, msg.content,
         msg.read || false, msg.createdAt || new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE messages SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    }
  },

  // ── Reseñas ───────────────────────────────────────────────────────────────
  reviews: {
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM reviews WHERE id=$1', [id]);
      return row(r);
    },
    // Reseñas de un producto específico (público)
    findByProduct: async (productId) => {
      const r = await pool.query(
        'SELECT * FROM reviews WHERE product_id=$1 ORDER BY created_at DESC',
        [productId]
      );
      return rows(r);
    },
    // Verificar si el comprador ya reseñó este producto
    findByBuyerAndProduct: async (buyerId, productId) => {
      const r = await pool.query(
        'SELECT * FROM reviews WHERE buyer_id=$1 AND product_id=$2',
        [buyerId, productId]
      );
      return row(r);
    },
    // Reseñas del vendedor: atraviesa órdenes → productos del vendedor
    findBySeller: async (sellerId) => {
      const r = await pool.query(
        `SELECT rv.*
         FROM reviews rv
         JOIN orders o ON rv.order_id = o.id
         WHERE o.seller_id = $1
         ORDER BY rv.created_at DESC`,
        [sellerId]
      );
      return rows(r);
    },
    // Busca la orden completada donde este comprador compró este producto a este vendedor
    findCompletedOrderForProduct: async (buyerId, sellerId, productId) => {
      const r = await pool.query(
        `SELECT id FROM orders
         WHERE buyer_id  = $1
           AND seller_id = $2
           AND status    = 'completed'
           AND items @> $3::jsonb
         ORDER BY created_at ASC
         LIMIT 1`,
        [buyerId, sellerId, JSON.stringify([{ productId }])]
      );
      return r.rows[0] ? r.rows[0].id : null;
    },
    create: async (review) => {
      const r = await pool.query(
        `INSERT INTO reviews (id, product_id, buyer_id, order_id, rating, comment, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [review.id, review.productId, review.buyerId, review.orderId,
         review.rating, review.comment || null, review.createdAt || new Date()]
      );
      return row(r);
    },
    // 3B — Calificación promedio del vendedor
    // Solo se muestra cuando hay al menos 20 reseñas dentro del pool
    // de las primeras 20 ventas completadas del vendedor (ordenadas por created_at ASC)
    calculateSellerRating: async (sellerId) => {
      const r = await pool.query(
        `WITH first_20 AS (
           SELECT id FROM orders
           WHERE seller_id = $1 AND status = 'completed'
           ORDER BY created_at ASC
           LIMIT 20
         )
         SELECT ROUND(AVG(rv.rating)::numeric, 2) AS avg_rating,
                COUNT(rv.id)::int                 AS total
         FROM reviews rv
         WHERE rv.order_id IN (SELECT id FROM first_20)
           AND rv.rating IS NOT NULL`,
        [sellerId]
      );
      const { avg_rating, total } = r.rows[0];
      // El promedio solo se expone cuando hay 20 o más calificaciones
      if (!total || total < 20) return null;
      return parseFloat(avg_rating);
    }
  },

  // ── Notificaciones ────────────────────────────────────────────────────────
  notifications: {
    findByUser: async (userId) => {
      const r = await pool.query(
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC',
        [userId]
      );
      return rows(r);
    },
    create: async (notif) => {
      const r = await pool.query(
        `INSERT INTO notifications (id, user_id, type, message, read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [notif.id, notif.userId, notif.type || null, notif.message,
         notif.read || false, notif.createdAt || new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE notifications SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    }
  },

  // ── Reportes ──────────────────────────────────────────────────────────────
  reports: {
    getAll: async () => {
      const r = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
      return rows(r);
    },
    findById: async (id) => {
      const r = await pool.query('SELECT * FROM reports WHERE id=$1', [id]);
      return row(r);
    },
    create: async (report) => {
      const r = await pool.query(
        `INSERT INTO reports (id, target_type, target_id, reason, reported_by, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [report.id, report.targetType, report.targetId, report.reason,
         report.reportedBy, report.status || 'pending', report.createdAt || new Date()]
      );
      return row(r);
    },
    update: async (id, updates) => {
      const { clause, values } = buildSet(updates, 1);
      const r = await pool.query(
        `UPDATE reports SET ${clause} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id]
      );
      return row(r);
    }
  }
};

module.exports = database;

// ✅ database.js — completado
