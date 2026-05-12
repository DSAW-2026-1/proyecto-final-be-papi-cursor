-- ============================================================
-- Migración 001 — Esquema inicial Unisabana Marketplace
-- Ejecutar UNA sola vez contra la base de datos PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  roles       TEXT[]      NOT NULL DEFAULT '{"buyer"}',
  status      VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Productos
CREATE TABLE IF NOT EXISTS products (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Carritos (uno por usuario)
CREATE TABLE IF NOT EXISTS carts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items      JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Órdenes
-- seller_confirmed_payment + buyer_confirmed_receipt: ambas requeridas para status = 'completed'
CREATE TABLE IF NOT EXISTS orders (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                  UUID         NOT NULL REFERENCES users(id),
  seller_id                 UUID         NOT NULL REFERENCES users(id),
  items                     JSONB        NOT NULL DEFAULT '[]',
  total                     NUMERIC(12,2) NOT NULL,
  status                    VARCHAR(50)  NOT NULL DEFAULT 'pending',
  seller_confirmed_payment  BOOLEAN      NOT NULL DEFAULT false,
  buyer_confirmed_receipt   BOOLEAN      NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Restricción: completed solo cuando ambas partes confirman
  CONSTRAINT completed_requires_both_confirmations CHECK (
    status <> 'completed' OR (seller_confirmed_payment = true AND buyer_confirmed_receipt = true)
  )
);

-- Conversaciones
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id        UUID        NOT NULL REFERENCES users(id),
  seller_id       UUID        NOT NULL REFERENCES users(id),
  product_id      UUID        REFERENCES products(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mensajes
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES users(id),
  content         TEXT        NOT NULL,
  read            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reseñas (una por orden)
CREATE TABLE IF NOT EXISTS reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id  UUID        NOT NULL REFERENCES users(id),
  buyer_id   UUID        NOT NULL REFERENCES users(id),
  order_id   UUID        UNIQUE NOT NULL REFERENCES orders(id),
  rating     INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notificaciones
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(100),
  message    TEXT        NOT NULL,
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reportes
CREATE TABLE IF NOT EXISTS reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('product', 'user')),
  target_id   UUID        NOT NULL,
  reason      TEXT        NOT NULL,
  reported_by UUID        NOT NULL REFERENCES users(id),
  status      VARCHAR(50) NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_products_seller    ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer       ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller      ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv      ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
-- idx_reviews_seller eliminado: la columna seller_id fue removida en migración 003

-- ✅ db/migrations/001_initial_schema.sql — completado
