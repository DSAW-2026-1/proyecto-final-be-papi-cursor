-- Migración 006: campos de perfil extendido (carrera y foto)
-- Requeridos por TRD §3 — Perfil de usuario

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS career VARCHAR(150) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo  TEXT         DEFAULT NULL;
