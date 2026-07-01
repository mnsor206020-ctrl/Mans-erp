-- Migration: Sprint 2.5 Milestone 1
-- Adds source_reference, source_module_url to journal_entries;
-- Creates journal_entry_attachments and notifications tables.

-- 1. Extend journal_entries with source tracking columns
ALTER TABLE "journal_entries" ADD COLUMN "source_reference" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN "source_module_url" TEXT;

-- 2. Create journal_entry_attachments
CREATE TABLE "journal_entry_attachments" (
    "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "journal_entry_id"     UUID         NOT NULL,
    "uploaded_by_user_id"  UUID         NOT NULL,
    "file_name"            TEXT         NOT NULL,
    "file_size_bytes"      INTEGER      NOT NULL,
    "mime_type"            TEXT         NOT NULL,
    "storage_key"          TEXT         NOT NULL,
    "storage_bucket"       TEXT         NOT NULL,
    "checksum_sha256"      TEXT         NOT NULL,
    "description_en"       TEXT,
    "description_ar"       TEXT,
    "is_primary"           BOOLEAN      NOT NULL DEFAULT false,
    "deleted_at"           TIMESTAMPTZ,
    "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_entry_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journal_entry_attachments_journal_entry_id_idx"    ON "journal_entry_attachments"("journal_entry_id");
CREATE INDEX "journal_entry_attachments_uploaded_by_user_id_idx" ON "journal_entry_attachments"("uploaded_by_user_id");
CREATE INDEX "journal_entry_attachments_deleted_at_idx"          ON "journal_entry_attachments"("deleted_at");

ALTER TABLE "journal_entry_attachments"
    ADD CONSTRAINT "journal_entry_attachments_journal_entry_id_fkey"
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE;

ALTER TABLE "journal_entry_attachments"
    ADD CONSTRAINT "journal_entry_attachments_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

-- 3. Create notifications
CREATE TABLE "notifications" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID         NOT NULL,
    "user_id"         UUID         NOT NULL,
    "event"           TEXT         NOT NULL,
    "entity_type"     TEXT         NOT NULL,
    "entity_id"       UUID         NOT NULL,
    "title_en"        TEXT         NOT NULL,
    "title_ar"        TEXT         NOT NULL,
    "body_en"         TEXT         NOT NULL,
    "body_ar"         TEXT         NOT NULL,
    "is_read"         BOOLEAN      NOT NULL DEFAULT false,
    "read_at"         TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_organization_id_idx" ON "notifications"("organization_id");
CREATE INDEX "notifications_user_id_idx"          ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx"          ON "notifications"("is_read");
CREATE INDEX "notifications_created_at_idx"       ON "notifications"("created_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
