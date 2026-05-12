-- ============================================================
-- Migración 004 — Columnas faltantes en products
-- updated_at, image, category, condition
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image       TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS condition   VARCHAR(50)  DEFAULT NULL;

-- ✅ db/migrations/004_products_extra_fields.sql — completado
