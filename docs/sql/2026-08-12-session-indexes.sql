-- Migration: Session hot-path indexes (calendar unification follow-up)
-- Generated: 2026-08-12
--
-- Session is the single calendar model (see
-- docs/superpowers/specs/2026-08-12-calendar-unification-plan.md) but had no
-- @@index. These cover the two hot query shapes:
--   1. client-scoped lists/ranges ordered by scheduledStart — client chart,
--      notes pipeline, auth-unit burn-down, weekly billable grid, parent
--      portal, activation gates
--   2. RBT-scoped schedule/payroll windows ordered by scheduledStart —
--      HRM listRbtScheduledSessions / listRbtPayrollSessions
-- Equality-only filters (e.g. rbtId + status) are served by the leading
-- column. Index names match Prisma's @@index defaults.
--
-- Idempotent; no order dependency on other docs/sql scripts (the "Session"
-- table has existed since the prisma/migrations archive).

CREATE INDEX IF NOT EXISTS "Session_clientId_scheduledStart_idx"
  ON "Session" ("clientId", "scheduledStart");

CREATE INDEX IF NOT EXISTS "Session_rbtId_scheduledStart_idx"
  ON "Session" ("rbtId", "scheduledStart");
