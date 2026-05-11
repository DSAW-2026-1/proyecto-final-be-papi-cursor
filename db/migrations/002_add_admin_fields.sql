-- ============================================================
-- Migración 002 — Campos para administración
-- Ejecutar UNA sola vez contra la base de datos PostgreSQL
-- ============================================================

-- Suspensión temporal de usuarios
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ DEFAULT NULL;

-- Campo para ocultar productos sin eliminarlos
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- ✅ db/migrations/002_add_admin_fields.sql — completado
