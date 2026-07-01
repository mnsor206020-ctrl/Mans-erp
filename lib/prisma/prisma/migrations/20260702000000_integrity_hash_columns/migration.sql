-- Migration: integrity hash columns
-- Adds SHA-256 integrity hash fields to journal_entries

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "integrity_hash" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "hash_algorithm" TEXT DEFAULT 'SHA-256';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "hashed_at" TIMESTAMP(3);
