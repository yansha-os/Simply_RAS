# Supabase Storage readiness report

**Run:** 2026-08-12 08:25:00 UTC  
**Verifier:** `node scripts/check-storage-readiness.mjs`  
**Safety:** Read-only. The verifier only permits `GET /storage/v1/bucket`; it does not list objects, upload files, change buckets, or query/mutate Postgres.

## Result: FAIL

The live bucket metadata check could not authenticate because `SUPABASE_SERVICE_ROLE_KEY` is not configured in the process or the discovered repo/app env files. `NEXT_PUBLIC_SUPABASE_URL` was available. No secrets or environment values were printed.

Because private buckets are not reliably discoverable with an anonymous key, bucket existence, privacy, size limits, and MIME allowlists remain **unverified** rather than being reported as absent.

```text
[FAIL] Configuration
    !! SUPABASE_SERVICE_ROLE_KEY is not configured.

RESULT: FAIL — cannot perform authenticated read-only bucket metadata check.
```

## Requirements found in code

| Bucket | Required privacy | Application cap | Application-accepted MIME types | Source |
|---|---:|---:|---|---|
| `client-documents` | Private | 5 MB | `application/pdf`, `image/jpeg`, `image/png` | `apps/crm/src/app/api/upload/route.ts` |
| `ats-applicant-docs` | Private | 10 MB | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` | `apps/hrm/src/app/actions/candidateDocumentActions.ts` (same settings in onboarding-signature and 40-hour-course actions) |
| `ats-interview-recordings` | Private | 50 MB | `video/webm`, `video/mp4`, `audio/webm`, `audio/mpeg` | `apps/hrm/src/app/actions/interviewRecordingActions.ts`, `apps/hrm/src/lib/uploadValidation.ts` |

The archived SQL defines `ats-applicant-docs` at 10 MB with its four required MIME types. It defines `ats-interview-recordings` at 500 MB with its four required MIME types; that is compatible with the current 50 MB application cap. No canonical bucket-definition SQL was found for `client-documents`.

The verifier accepts a bucket size limit of `null` (unlimited) or any value at least as large as the application cap. It accepts a MIME allowlist of `null` (unrestricted) or a list containing every application-accepted MIME type.

## Dashboard remediation

1. In the deployment secret manager, set server-only `SUPABASE_SERVICE_ROLE_KEY` for the verification environment. Never prefix it with `NEXT_PUBLIC_`, commit it, or paste it into this report.
2. In **Supabase Dashboard → Storage → Buckets**, confirm all three bucket names above exist.
3. Open each bucket's settings and ensure **Public bucket** is disabled.
4. Ensure each file-size limit is unlimited or at least the application cap shown above.
5. If a bucket uses an allowed-MIME list, include every MIME type shown above.
6. Re-run `node scripts/check-storage-readiness.mjs`. Readiness is achieved only when all three bucket checks print `PASS`.

Creating or editing buckets is intentionally outside this verifier's scope.
