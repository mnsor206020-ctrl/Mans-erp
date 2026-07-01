ALTER TABLE "journal_entry_approvals" ADD COLUMN IF NOT EXISTS "duration_seconds" INTEGER;
ALTER TABLE "journal_entry_approvals" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "journal_entry_approvals" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
CREATE INDEX IF NOT EXISTS "journal_entry_approvals_created_at_idx" ON "journal_entry_approvals"("created_at");
