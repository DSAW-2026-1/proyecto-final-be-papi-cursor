-- ============================================================
-- Migración 005 — Añadir delivered_at a orders
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL;

-- ✅ db/migrations/005_orders_delivered_at.sql — completado
