-- Migration: richer CaseOpening listing fields + RBT home zip for distance matching
-- Generated: 2026-08-11
-- Run in Supabase SQL Editor after case-opening marketplace SQL. Idempotent.

ALTER TABLE "CaseOpening"
  ADD COLUMN IF NOT EXISTS "zipCode" TEXT,
  ADD COLUMN IF NOT EXISTS "childAge" INTEGER,
  ADD COLUMN IF NOT EXISTS "languagePref" TEXT,
  ADD COLUMN IF NOT EXISTS "genderPref" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceSetting" TEXT DEFAULT 'In-home ABA (97153)',
  ADD COLUMN IF NOT EXISTS "sessionLengthMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "daysOfWeek" TEXT,
  ADD COLUMN IF NOT EXISTS "listingHighlights" TEXT;

ALTER TABLE "CandidateOnboardingPacket"
  ADD COLUMN IF NOT EXISTS "homeZipCode" TEXT,
  ADD COLUMN IF NOT EXISTS "maxTravelMiles" INTEGER DEFAULT 15;
