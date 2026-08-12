# Route Integrity Report — 2026-08-12

**Status: PASS.** The checker found no high-confidence dead route literals and made no link changes.

## Command

```powershell
node scripts/check-route-integrity.mjs
```

Latest recorded run: `2026-08-12T08:49:00.671Z`.

## Scope and method

- Built route inventories directly from `apps/crm/src/app` and `apps/hrm/src/app`.
- Applied Next.js App Router conventions: route groups and parallel slots do not add URL segments; dynamic, required catch-all, and optional catch-all segments remain matchable route patterns.
- Inventoried both `page.*` routes and `route.*` handlers.
- Parsed production JavaScript/TypeScript source with the TypeScript AST rather than matching comments or arbitrary strings.
- Scanned literals used by JSX/object/assignment `href`, notification `linkUrl`, and `redirect` / `permanentRedirect`, including conditional branches, template literals, `new URL(...)`, known CRM/HRM URL wrappers, and file-local literal bindings.
- Excluded tests, fixtures, generated code, and build output.
- Compared static paths against both apps. When a sibling static route is more specific than a local catch-all redirect stub, the sibling route owns the link.
- Classified runtime templates separately. An unresolved template is review-only and cannot fail the gate.

## Inventory snapshot

- CRM: 27 page routes and 4 route handlers.
- HRM: 27 page routes and 1 route handler.
- Dynamic or catch-all patterns detected:
  - CRM: `/api/generate-report/[clientId]`, `/client/[id]`, `/magic-link/[id]`, `/portal-hr/[[...path]]`, `/rbt/[[...path]]`
  - HRM: `/ats/applicant/[id]`, `/magic-link/[token]`, `/rbt/session/[sessionId]`

## Scan results

- 347 source files scanned.
- 449 literal occurrences across 92 files.
- Primary classifications:
  - 283 same-app static literals
  - 15 cross-app static literals
  - 1 API literal
  - 72 dynamic templates
  - 0 probable-dead literals
  - 78 allowlisted non-route literals
- Resolved scope, including API and dynamic templates:
  - 336 same-app occurrences
  - 35 cross-app occurrences
  - 0 unknown-app occurrences
  - 78 non-route occurrences

## Findings

### High-confidence dead routes

None.

A finding is high-confidence only when it is a static root-relative path, is not allowlisted, does not resolve to an existing public asset, and matches no page or route handler in either app.

### Cross-app links

The 35 cross-app occurrences resolve to existing sibling-app routes. Common CRM-to-HRM targets include `/ats`, `/hr-dashboard`, `/payroll`, `/rbt/job-board`, `/rbt/payroll`, `/rbt/schedule`, `/rbt/session/[sessionId]`, and `/apply`. HRM-to-CRM targets include `/case`, `/client/[id]`, `/notes`, `/portal-clinical`, and `/portal-clinical/notes`.

CRM's `/rbt/[[...path]]` compatibility route did not mask HRM's more-specific `/rbt/*` routes during classification.

### API link

`/api/generate-report/${client.id}` matches CRM's `/api/generate-report/[clientId]` route handler.

### Dynamic review items

Of 72 dynamic templates, 69 matched an inventory shape. Three remain review-only:

- CRM `resolveNotificationLink`: `${base}${linkUrl}`
- HRM `resolveNotificationLink`: `${base}${linkUrl}`
- CRM legacy HR redirect map: `${base}${ROUTE_MAP[key] ?? '/hr-dashboard'}`

These are runtime-selected destinations, not evidence of dead routes, so they do not affect the exit code.

### False-positive allowlist

The script keeps the allowlist next to the classifier with an explanation for each exception. This run allowed:

- 47 same-page anchors
- 18 `mailto:` / `tel:` links
- 9 external HTTP(S) links
- 3 verified files under an app's `public/` directory
- 1 query-only current-page link

The public-asset exception checks that the file exists; it is not a blanket extension exemption.

## Verification

- `node --check scripts/check-route-integrity.mjs`: passed.
- `node scripts/check-route-integrity.mjs`: passed with exit `0`.
- `npm test`: 40 files and 449 tests passed.
- `npm run typecheck`: blocked by five existing `packet is possibly null` errors in `apps/crm/src/components/client-profile/tabs/IntakeDocumentsTab.tsx` (lines 255, 300, 880, 931, and 968). The route-checker task did not modify that source file.

## Exit behavior

- Exit `0`: no high-confidence dead routes. Review-only dynamic templates and allowlisted non-routes do not fail.
- Exit `1`: at least one high-confidence dead route occurrence.
- Exit `2`: the checker itself could not complete; this is an operational error, not a route-integrity finding.

No source links were auto-edited.
