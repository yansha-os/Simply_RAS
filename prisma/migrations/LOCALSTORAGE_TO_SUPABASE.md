# LocalStorage → Supabase migration phases

Run SQL in order in the **Supabase SQL Editor** (DEV first). Do **not** run `prisma migrate` / `db push` from the agent.

After each SQL phase, we wire the matching app code, then delete those localStorage keys.

| Phase | File | Replaces | Status |
|-------|------|----------|--------|
| 0 | `07_ats_candidate_durable.sql` | ATS stage SoT on `AtsCandidate` | Done (DEV) |
| 1 | `08_onboarding_progress.sql` | Requirement flags (`ras_rbt_*`) | **Done (DEV) + app wired** |
| 2 | `09_ats_interviews.sql` | Interview booking/eval payload | **Done (DEV) + app wired** |
| 3 | `10_ats_help_desk.sql` | Help tickets | **Done (DEV) + app wired** |
| 4 | `11_interview_recordings.sql` | IndexedDB recordings → Storage | **Done (DEV) + app wired** |
| 5 | `12_candidate_documents.sql` | Resume/gov ID data URLs | **Done (DEV) + app wired** |
| 6 | `13_applicant_device_sessions.sql` | Device-bound magic login | **Done (DEV) + app wired** |
| 7 | `14_onboarding_signatures.sql` | E-sign / upload / quiz audit events | **SQL + app wired — run in Supabase** |
| 8 | `15_ls54_wage_offer.sql` | Head HR LS-54 hire-last offer payload/status | **SQL + app wired — run in Supabase** |

## Not product data (keep in browser)

- `hrm_active_role` — Dev Tools UI only
- Theme / color mode preferences
- Session display cache (`ras_session_*` in sessionStorage) mirrored from device session — not SoT

## After Phase 3 SQL

**Done.** `AtsHelpTicket` / `AtsHelpMessage` + create/claim/resolve/message actions.
RBT help desk, HR help tickets, and ATS HELP_DESK column use Supabase.
Open tickets set `AtsCandidate.stage = HELP_DESK`; resolve recomputes stage.

## After Phase 4 SQL

**Done.** `AtsInterviewRecording` + private bucket `ats-interview-recordings`.
ATS applicant interview tab uploads/lists/deletes takes via Storage (signed URLs).
Set `SUPABASE_SERVICE_ROLE_KEY` on the HRM server for Dev Tools / no-session uploads.

## After Phase 5 SQL

**Done.** Resume / gov ID paths on `CandidateOnboardingPacket` + private bucket `ats-applicant-docs`.
Public apply uploads via token-gated `attachApplicantDocuments`; ATS dossier previews use signed URLs.
Requires `SUPABASE_SERVICE_ROLE_KEY` for public apply uploads (no Auth session).

## After Phase 6 SQL

**Done.** `ApplicantDeviceSession` + packet device/invite columns.
Magic-link `/magic-link/{token}` binds fingerprint → DB session → httpOnly cookies.
Dev Tools impersonation creates a real device session. `getActiveApplicantId` hydrates from cookies.

## After Phase 7 SQL

**Wired.** `OnboardingSignatureEvent` + LS-54 prepare columns.
Applicant e-sign/upload/quiz writes SHA-256 audit events (IP, UA, device, doc version).
Confirmation is required before signing and before advancing to the next page.

## After Phase 8 SQL

**Wired.** LS-54 hire-last offer on `CandidateOnboardingPacket` (`ls54Payload` / status / version).
Head HR **Extend Offer** tab drafts/sends; applicant signs/discusses/declines; `hireCandidate` requires signed LS-54.

LocalStorage → Supabase migration phases 0–8: Phases 7–8 SQL still need to be run in Supabase.
