# Supabase RLS and Storage policy inventory

**Snapshot:** 2026-08-12  
**Scope:** Live `public` table RLS, live Storage bucket/object policies, and the active CRM/HRM database access planes.  
**Safety:** Read-only. Catalog and bucket metadata were queried inside `BEGIN READ ONLY` transactions through the configured session-pooler `DATABASE_URL`. No application rows or stored object names/content were queried. No mutating SQL, policy changes, or bucket changes were executed.

## Executive result

1. All **39 live `public` tables have RLS enabled**. None has `FORCE ROW LEVEL SECURITY`.
2. **38 of 39 tables have no policies**, so `anon` and `authenticated` Data API calls are deny-by-default while RLS remains enabled.
3. `Client` is the exception. Its policy named “Allow authenticated staff to read clients” actually permits **every Supabase-authenticated principal** to select every client row. It does not test the application `User.role` or client assignment.
4. The session-pooler role used by Prisma has `BYPASSRLS`, owns all 39 tables, and is the shared role behind `@repo/db`. Therefore **RLS does not authorize or constrain any current Prisma query**.
5. Static source inspection found **no active Supabase Data API table calls** (`.from("table")`) or RPC calls in either app. Supabase clients are used for Auth and Storage; business data is read and written through Prisma.
6. All three Storage buckets are private. `client-documents` has no object policies and is service-role/broker only. The two ATS buckets have eight bucket-wide policies that give any `authenticated` user SELECT/INSERT/UPDATE/DELETE access without staff-role, candidate, owner, or path checks.
7. The current verification environment has the Supabase URL and anon key, but **does not have `SUPABASE_SERVICE_ROLE_KEY`**. Service-role REST was therefore unavailable; live bucket metadata and policies were obtained through the read-only database session.

The recommended current-state architecture is server-authoritative: keep business tables Prisma-only, remove accidental Data API exposure, broker private Storage through guarded server code, and treat application authorization as mandatory. RLS can be added later only for explicitly selected direct-client surfaces.

## Method and limits

Live metadata inspected:

- `pg_class` + `pg_namespace`: relation type, `relrowsecurity`, `relforcerowsecurity`, and owner.
- `pg_policies`: policy role, command, `USING`, and `WITH CHECK`.
- `information_schema.role_table_grants`: `anon`, `authenticated`, and `service_role` grants.
- `pg_default_acl`: grants inherited by newly created tables, functions, and sequences.
- `storage.buckets`: name, privacy, size limit, MIME allowlist, and timestamps.
- Static imports and calls under the two active Next.js apps and `packages/db`.

Limits:

- The service-role key was absent after loading the root, CRM, and HRM environments, so no service-role REST request was attempted.
- No Storage objects were listed and no object contents or paths were queried.
- `current_setting('pgrst.db_schemas', true)` returned `null` through the pooler. Confirm the Dashboard's Data API enabled/exposed-schema settings separately. This report treats `public` as potentially exposed because it has explicit Data API role grants and is Supabase's conventional exposed schema.
- Deployment secrets were not inspected. “Service role absent” means this verification environment, not necessarily every deployment.
- Public functions/RPC behavior is not a full part of this table-policy inventory. There were no public views, materialized views, or foreign tables at the snapshot.
- Root `src/` was excluded from the active-app map: root scripts build only `apps/crm` and `apps/hrm`, and only those workspaces have Next configs.

## Live `public` RLS inventory

### Summary

- Physical/partitioned tables: **39**
- RLS enabled: **39**
- RLS disabled: **0**
- Force RLS enabled: **0**
- Tables with at least one policy: **1**
- Tables with no policy: **38**
- Public views/materialized views/foreign tables: **0**

### Policies present

`Client` has two permissive policies:

1. **Allow authenticated staff to read clients**
   - Command: `SELECT`
   - Policy role: `public`
   - `USING`: `auth.role() = 'authenticated' OR auth.role() = 'service_role'`
   - Effective result: every authenticated Supabase user can select every `Client` row.
2. **Allow service_role full client access**
   - Command: `ALL`
   - Policy role: `public`
   - `USING`: `auth.role() = 'service_role'`
   - Effective result: redundant for a genuine service-role request, because service-role access bypasses RLS.

`Client` contains direct identifiers and PHI/PII, including name, date of birth, insurance/member/Medicaid identifiers, guardian contact details, address, treatment plan, and staff assignments. The first policy's name is therefore materially stronger than its predicate.

### RLS enabled, no policies

For `anon` and `authenticated`, these tables are deny-all through the Data API while RLS remains enabled:

`ActionItem`, `ApplicantDeviceSession`, `AtsCandidate`, `AtsHelpMessage`, `AtsHelpTicket`, `AtsInterview`, `AtsInterviewRecording`, `AuditLog`, `AuditLogVault`, `AuthCptCode`, `Authorization`, `BehaviorLog`, `BehaviorTarget`, `CandidateOnboardingPacket`, `CaseApplication`, `CaseOpening`, `ClientMessage`, `ContactLog`, `Document`, `EVVLog`, `FirstSessionConsensus`, `GoalTemplate`, `IntakePacket`, `NoteDeficiency`, `Notification`, `OnboardingSignatureEvent`, `PARequest`, `RbtOnboarding`, `ReAuthPacket`, `ScheduleAppointment`, `Session`, `SessionNote`, `SessionTrialData`, `SkillTarget`, `StaffCredential`, `StaffMessage`, `StartDatePoll`, and `User`.

No policy does **not** block:

- the pooler role, which has `BYPASSRLS`;
- table owners unless force-RLS applies; or
- Supabase service-role requests.

### Grants and default privileges

Each of the 39 tables grants all of the following to each of `anon`, `authenticated`, and `service_role`:

`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER`.

RLS currently prevents `anon`/`authenticated` row access except for the `Client` policy, but grants are the first access-control layer. If RLS is accidentally disabled on a table, the existing grants make that table immediately reachable to the granted API roles.

The live `public` default ACLs also grant:

- full table privileges to `anon`, `authenticated`, and `service_role`;
- function execute to those roles; and
- sequence usage/read/write to those roles,

for objects created by both the `postgres` and `supabase_admin` defaults. New objects therefore inherit an exposed-by-default grant posture even if their RLS/policy setup is incomplete.

### Live/schema drift relevant to policy ownership

The two checked Prisma schemas define 36 models. Three additional live public tables are not modeled in either schema and had no exact source references:

- `AuditLog`
- `FirstSessionConsensus`
- `StartDatePoll`

They are RLS-enabled with no policies. Decide whether each is retained, archived, or brought under a named owner before building a policy matrix around it.

## Application access-plane inventory

### Shared Prisma service access

`packages/db/src/index.ts` constructs `PrismaClient` with `PrismaPg(new Pool({ connectionString: DATABASE_URL }))`. Both `apps/crm/src/lib/prisma.ts` and `apps/hrm/src/lib/prisma.ts` re-export that singleton.

The live pooler role is:

- not a superuser;
- `BYPASSRLS = true`;
- owner of all 39 public tables; and
- connected with the session setting `row_security = on`.

`row_security = on` does not overcome `BYPASSRLS`. Current Prisma access is privileged server access.

Prisma import-bearing path families:

- **CRM**
  - `apps/crm/src/app/actions/*.ts`: client lifecycle, case openings, intake, clinical goals/review/metrics, notes/signing, auth units, weekly units, chat, notifications, action items, and related mutations.
  - `apps/crm/src/app/(dashboard)/**`: server pages/actions for case, clinical, clinical support, notes, billing, intake/case portal, case coordination, and clinical portal.
  - `apps/crm/src/app/magic-link/**`, `app/login/actions.ts`, and `app/page.tsx`.
  - `apps/crm/src/app/api/health/route.ts` and `app/api/generate-report/[clientId]/route.tsx`.
  - Server helpers including `lib/auth.ts`, `lib/auth-guard.ts`, `lib/magicLinkGuard.ts`, `lib/auditLog.ts`, and `lib/staffCredentials.server.ts`.
- **HRM**
  - `apps/hrm/src/app/actions/*.ts`: ATS, public application, applicant sessions/documents, onboarding, interviews/recordings, wage offers, staffing/credentials, case-opening applications, Session Studio, payroll, communications, notifications, and dev tools.
  - `apps/hrm/src/app/(dashboard)/rbt/actions.ts`, `app/hr-dashboard/page.tsx`, and `app/api/health/route.ts`.
  - Server helpers including `lib/auth.ts`, `lib/resolveActingRbt.ts`, `lib/assertApplicantHired.ts`, and `lib/auditLog.ts`.

These paths must authorize before each sensitive query or mutation. The relevant controls are application guards such as CRM `requireStaff`, `requireClientAccess`, and `requireParentPacketAccess`, plus HRM `requireStaff`/`requireRole` and applicant device-session checks. RLS is not a fallback for missed guards on these paths.

### Supabase Auth clients

The anon-key SSR client is used for authentication/session handling:

- CRM: `apps/crm/src/proxy.ts`, `src/lib/auth.ts`, `src/app/login/actions.ts`, and `src/app/page.tsx`.
- HRM: `apps/hrm/src/proxy.ts`, `src/lib/auth.ts`, and `src/app/login/actions.ts`.

After `supabase.auth.getUser()`, each app normally loads the canonical application user and role through Prisma. The database `User.role`, not a current RLS policy, drives server authorization.

Both apps define `src/lib/supabase/client.ts`, but no active import of either browser-client module was found.

### Supabase Data API

No active app code was found calling:

- `supabase.from(<business table>)`;
- `.schema(...)`;
- `.rpc(...)`; or
- Supabase Realtime for database rows.

All `.from(...)` calls found in active app code were Storage bucket calls. There is therefore no observed application dependency on direct Data API access to the 39 public tables.

### Supabase Storage clients

- **CRM `client-documents`**
  - `apps/crm/src/app/api/upload/route.ts`: guarded upload through `createAdminClient()`.
  - `apps/crm/src/app/api/documents/route.ts`: guarded, short-lived signed URL through `createAdminClient()`.
  - There is no user-client fallback. Without the service-role key, these routes report Storage as unavailable.
- **HRM `ats-applicant-docs`**
  - `candidateDocumentActions.ts`
  - `onboardingSignatureActions.ts`
  - `fortyHourCourseActions.ts`
  - Each prefers the admin client, then falls back to the cookie-bound anon-key server client.
  - Public/magic-link applicant flows do not normally have a Supabase Auth JWT, so service-role configuration is required for reliable uploads. A logged-in user fallback is governed by `storage.objects` RLS.
- **HRM `ats-interview-recordings`**
  - `interviewRecordingActions.ts` prefers the admin client, with a real signed-in staff client fallback.
  - It creates signed upload URLs, verifies stored size and magic bytes, creates signed read URLs, and removes objects.

## Live Storage inventory

Both `storage.buckets` and `storage.objects` have RLS enabled and force-RLS disabled. `storage.buckets` has no policies. `storage.objects` has eight policies.

| Bucket | Private | Live bucket limit | Live MIME allowlist | Application limit | Object policies |
|---|---:|---:|---|---:|---|
| `client-documents` | Yes | Unlimited (`null`) | Unrestricted (`null`) | 5 MB | None |
| `ats-applicant-docs` | Yes | 10 MB | PDF, JPEG, PNG, WebP | 10 MB | Authenticated bucket-wide CRUD |
| `ats-interview-recordings` | Yes | 500 MB | WebM/MP4 video, WebM/MPEG audio | 50 MB | Authenticated bucket-wide CRUD |

### `client-documents`

No `storage.objects` policy references this bucket. Consequently:

- `anon` and normal `authenticated` clients cannot access its objects through Storage RLS;
- guarded service-role calls can access it because service role bypasses RLS; and
- its private flag prevents public object URLs, but server-issued signed URLs remain available.

This is the strongest of the three current object-policy postures. Its bucket-level size and MIME controls are missing, so only the CRM route's 5 MB/type/magic-byte checks provide those controls.

### `ats-applicant-docs`

Four permissive policies apply to role `authenticated`:

- `ats_docs_select_authenticated`
- `ats_docs_insert_authenticated`
- `ats_docs_update_authenticated`
- `ats_docs_delete_authenticated`

Every expression checks only `bucket_id = 'ats-applicant-docs'`. There is no application-role check, candidate ownership, `owner_id`, or folder-prefix isolation. Object paths include both `{candidateId}/...` and `onboarding/{candidateId}/...`, but the policies do not inspect either pattern.

### `ats-interview-recordings`

Four permissive policies apply to role `authenticated`:

- `ats_recordings_select_authenticated`
- `ats_recordings_insert_authenticated`
- `ats_recordings_update_authenticated`
- `ats_recordings_delete_authenticated`

Every expression checks only `bucket_id = 'ats-interview-recordings'`. It does not validate HR/leadership role, candidate/interview assignment, `owner_id`, or the `{candidateId}/{interviewId}/{recordingId}` path.

The live 500 MB bucket limit is compatible with the 50 MB application cap but is not equivalent defense in depth: a caller who reaches Storage outside the application validation can upload up to the bucket limit if policy permits.

## False assumptions to reject

1. **“RLS is enabled, so Prisma is protected.”** False. The current Prisma pooler role has `BYPASSRLS` and owns every public table.
2. **“No RLS policy means nobody can access the table.”** False for bypass roles, owners, and service role. It is deny-all only for non-bypass roles subject to RLS.
3. **“The policy says staff, so it is staff-only.”** False. Policy names are comments, not controls. The `Client` predicate accepts every authenticated Supabase user.
4. **“A private bucket is caller-isolated.”** False. `public = false` blocks public URLs; `storage.objects` policies still determine authenticated operations. The ATS policies are bucket-wide.
5. **“Service role needs an allow policy.”** False. Service-role requests bypass RLS. The surrounding server guard is the authorization boundary.
6. **“Turning off RLS later would be harmless because the app uses Prisma.”** False. Existing and default grants already give broad API-role privileges.
7. **“Adding table RLS can replace server guards.”** False in this architecture. Parent/applicant token flows are not Supabase Auth identities, and Prisma does not propagate a verified per-request JWT identity into its database transactions.
8. **“The anon-key fallback is equivalent to admin Storage access.”** False. It is RLS-bound; unauthenticated applicant calls are `anon`, while signed-in users receive whatever the broad authenticated policies permit.

## Gaps and risk ranking

### High

1. **`Client` direct-read exposure.** If the Data API is enabled with `public` exposed, any authenticated Supabase account can read all client rows and PHI/PII. Confirm the Dashboard setting immediately; do not infer safety from the policy name.
2. **Prisma has unrestricted row access.** A missed or overly broad server guard can affect any row because the pooler bypasses RLS. Application authorization review and tests remain required even if future table policies are added.
3. **ATS Storage policies lack row/path ownership.** Any authenticated account can list/read/write/delete throughout both ATS buckets. This bypasses the role and candidate checks in the HRM server actions.

### Medium

4. **Broad current and future grants.** Every existing public table is granted broadly, and default ACLs repeat the posture for future tables/functions/sequences.
5. **Service-role configuration gap in this environment.** CRM client-document operations cannot work; unauthenticated HRM applicant uploads cannot reliably use the authenticated-only policies. This is configuration evidence, not proof about production.
6. **Bucket defense-in-depth mismatch.** `client-documents` has no bucket size/MIME restrictions; interview recordings permit 500 MB at the bucket layer versus 50 MB in app validation.
7. **Unmanaged live tables.** `AuditLog`, `FirstSessionConsensus`, and `StartDatePoll` lack schema/source ownership.
8. **Policy provenance drift.** The live `Client` policies and public-table RLS posture were not found in canonical `docs/sql/`. The eight Storage policies exist only in archived `prisma/migrations/11_interview_recordings.sql` and `12_candidate_documents.sql`.

## Recommended staged policy plan

No policy SQL is proposed or applied in this inventory. Make each stage a separately reviewed, manually applied Supabase change with explicit rollback and negative tests.

### Stage 0 — choose the access architecture

Adopt **server-authoritative/Prisma-only** as the current baseline because no active direct Data API table consumer was found:

- confirm whether the Data API is enabled and which schemas are exposed;
- inventory any external consumer not present in this repository;
- treat all business tables as non-public API implementation details;
- keep parent and applicant magic-link/device flows server-mediated; and
- retain mandatory server guards for all Prisma/service-role operations.

Do not write 39 permissive policies merely because 38 tables currently have none.

### Stage 1 — contain accidental Data API exposure

After confirming no external dependency:

- remove or replace the broad authenticated `Client` read policy;
- revoke `anon`/`authenticated` grants from Prisma-only tables and stop future automatic grants;
- preferably disable the Data API if it is unused, or expose a dedicated minimal API schema instead of the model-rich `public` schema;
- audit existing and future public functions separately because RLS does not protect function execution; and
- version the approved grant/RLS baseline under the repository's canonical `docs/sql/` process.

Keep RLS enabled as defense in depth even after grants are reduced.

### Stage 2 — define an explicit authorization matrix

Before any direct-client table policy, document per operation:

- actor: anonymous applicant, device-bound applicant, RBT, BCBA, case coordinator, clinical support, billing, HR, leadership, or service worker;
- resource scope: self, assigned client, assigned candidate, team, or all;
- operation: select, insert, update, delete;
- canonical identity link: Supabase `auth.uid()` to `User.id`;
- revocation and inactive-user behavior; and
- whether the use case must remain a guarded server action.

Use canonical database/application authorization data or controlled `app_metadata`; never trust user-editable `user_metadata`. Account for JWT claim staleness. Assignment policies should use indexed foreign keys and `(select auth.uid())`-style stable lookups where appropriate.

### Stage 3 — harden Storage

Preferred plan:

- configure the server-only service-role secret in each deployment that brokers Storage;
- keep `client-documents` service-broker only;
- move ATS applicant documents and recordings to guarded broker/signed-URL flows; and
- only then remove the bucket-wide authenticated ATS policies.

If direct authenticated Storage must remain, replace bucket-only checks with operation-specific policies that enforce:

- allowed application roles from non-user-editable authorization data;
- exact candidate/client/interview ownership or assignment;
- normalized, server-compatible folder prefixes;
- explicit SELECT requirements for read/list and any upsert behavior; and
- cross-user/cross-candidate denial.

Align bucket limits/MIME allowlists with the application controls, especially `client-documents` and the 50 MB recording cap.

### Stage 4 — reduce Prisma connection blast radius

Choose explicitly between:

1. **Server-authoritative Prisma:** a dedicated non-owner application role with only required table privileges. If it retains RLS bypass for server access, application guards remain the sole row-authorization boundary.
2. **RLS-enforced Prisma:** a non-bypass role plus verified per-request identity/claims set transaction-locally, with connection-pool reset guarantees and policies designed for that context.

Simply removing `BYPASSRLS` from the current role would make the 38 no-policy tables deny Prisma and is not a safe standalone change.

### Stage 5 — verification gates

Before rollout, prove at minimum:

- `anon` cannot read or mutate any business table;
- a normal authenticated user cannot read all `Client` rows;
- each staff role can access only its approved operation/resource scope;
- unassigned BCBA/RBT users cannot access another client's clinical rows;
- applicant/device sessions cannot cross candidate boundaries;
- ATS Storage users cannot list/read/delete another candidate's documents or recordings;
- server-broker paths still work when user-facing policies are deny-all;
- service-role keys are never browser-exposed; and
- disabling/restricting Data API grants does not break either Next.js app.

Run negative tests before positive tests are accepted as evidence.

## Reference points

- Shared Prisma client: `packages/db/src/index.ts`
- CRM guards: `apps/crm/src/lib/auth-guard.ts`, `apps/crm/src/lib/magicLinkGuard.ts`
- HRM guards: `apps/hrm/src/lib/auth-guard.ts`
- CRM Storage broker: `apps/crm/src/app/api/upload/route.ts`, `apps/crm/src/app/api/documents/route.ts`
- HRM Storage actions: `apps/hrm/src/app/actions/candidateDocumentActions.ts`, `fortyHourCourseActions.ts`, `onboardingSignatureActions.ts`, `interviewRecordingActions.ts`
- Archived Storage policy definitions: `prisma/migrations/11_interview_recordings.sql`, `prisma/migrations/12_candidate_documents.sql`
- Current Supabase guidance: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api), and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
