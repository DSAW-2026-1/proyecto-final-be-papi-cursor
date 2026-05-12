-- ============================================================
-- Migración 003 — Reseñas por producto (Prompt 3)
-- Reemplaza el esquema de reviews: seller_id → product_id
-- + restricción única (buyer, product) en lugar de (order)
-- ============================================================

-- Eliminar tabla antigua (sin datos de producción relevantes)
DROP TABLE IF EXISTS reviews CASCADE;

-- Nueva tabla reviews ligada a producto, no a vendedor
CREATE TABLE reviews (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id    UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  order_id    UUID         NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  rating      INTEGER      NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Un comprador solo puede dejar UNA reseña por producto
  CONSTRAINT unique_review_per_buyer_product UNIQUE (buyer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer   ON reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order   ON reviews(order_id);

-- ✅ db/migrations/003_reviews_product.sql — completado
