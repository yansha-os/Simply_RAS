-- Client Portal Notifications: Add clientId to Notification table and create hot-path indexes
-- Idempotent DDL for Supabase SQL Editor

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "clientId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_clientId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_clientId_isRead_idx" ON "Notification"("clientId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
