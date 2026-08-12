# Accessibility + Performance Audit — CRM + HRM

**Date:** 2026-08-12
**Status:** Point-in-time audit — groundwork for gap 25 ("No a11y/perf budgets. Lighthouse/axe pass before GA") in [`2026-08-12-production-readiness-gap-analysis.md`](./2026-08-12-production-readiness-gap-analysis.md)
**Method:** Static code sweep of both apps (grep + targeted file reads) + Lighthouse 13 runs against the **dev servers** on `http://localhost:3000/login` (CRM) and `http://localhost:3001/login` (HRM). No code was changed. No axe run (needs a driven browser — occupied by another workstream); axe pass stays on the GA checklist.

**Priority lens:** parent magic-link portal (CRM `magic-link/*`) and RBT portal (HRM `rbt/*`, `apply`, public application) first — these are **external users** (parents of clients, job applicants) who don't get training or IT support. Staff dashboards second.

---

## 1. Executive summary

The apps are in better shape than a typical "premium dark UI" codebase on some axes — every `<img>` has alt text, both root layouts set `lang="en"`, the shared `Button`/`Input` primitives carry proper `focus-visible` rings, and Session Studio wraps its selects in real `<label>`s. Lighthouse a11y already scores 0.93 (CRM login) / 0.95 (HRM login).

But the two **external-user surfaces have keyboard-blocking defects**: the parent intake form's radio buttons and checkboxes put `className="hidden"` on the real input (`display:none` ⇒ removed from tab order — a keyboard or screen-reader parent **cannot answer those questions at all**), and the required-document upload tile is a click-only `<div>`. Modal dialogs across ~40 files have no focus trap, no `role="dialog"`, and (in all but 2 files) no Escape handling. ARIA is nearly absent repo-wide (`aria-label` in 10 files, `role=` in 4).

On performance: **zero `next/dynamic` and zero `loading.tsx` in either app**, 126 of 184 `.tsx` files are client components, and the RBT portal ships 60–114 KB single-file client monoliths. Dev-mode Lighthouse perf (0.40/0.42) is not meaningful for budgets — a prod-build run is the follow-up.

**Finding counts:** a11y — 2 Critical, 4 High, 3 Medium, 2 Low. Perf — 2 High, 2 Medium, 3 Low. (19 findings total.)

---

## 2. Lighthouse results (dev servers — treat perf as directional only)

| Page | Perf | A11y | Best-practices | LCP | TBT | CLS |
|------|-----:|-----:|---------------:|----:|----:|----:|
| CRM `/login` (:3000) | 0.40 | **0.93** | 1.00 | 8.9 s | 6,230 ms | 0 |
| HRM `/login` (:3001) | 0.42 | **0.95** | 1.00 | 8.1 s | 23,150 ms | 0.003 |

Perf numbers are dominated by dev-mode overhead (unminified bundles, on-demand compile, no source maps) — **do not budget against these**; rerun on `next build && next start`. CLS is genuinely excellent on both.

Failing a11y audits (both pages unless noted):
- `color-contrast` — brand orange `#f97316` on white at 2.8:1 (needs 4.5:1) in the login badge/button text, both apps.
- `heading-order` — headings skip levels.
- `landmark-one-main` — CRM login only: no `<main>` landmark.

---

## 3. Accessibility findings (severity-ranked)

Effort: S ≤ ½ day · M ≤ 2 days · L > 2 days.

| # | Sev | File:line | Issue | Fix | Effort |
|---|-----|-----------|-------|-----|:------:|
| A1 | **Critical** | `apps/crm/src/components/magic-link/FormUIHelpers.tsx:219, 258` | `AutoSaveRadio`/`AutoSaveCheckbox` render the real `<input>` with `className="hidden"` (`display:none`) — removed from tab order and accessibility tree. Keyboard/SR parents **cannot answer any radio/checkbox question** in intake Forms 01/02 (incl. required consents). | Replace `hidden` with an `sr-only` (visually-hidden-but-focusable) class; add `peer-focus-visible` ring on the custom control so focus is visible. | S |
| A2 | **Critical** | `apps/crm/src/components/magic-link/DocumentUploads.tsx:214–224, 263–268` | Required-doc upload tile is a click-only `<div onClick>` triggering a hidden file input — no `role`, `tabIndex`, or key handler. Keyboard/SR parents **cannot upload required intake documents**. Remove-file button is icon-only with `title` but no `aria-label`. | Make the tile a `<button type="button">` (or `<label htmlFor>` the file input with an `sr-only` input); `aria-label="Remove file"` on the X button. | S |
| A3 | High | `apps/crm/src/components/magic-link/MagicLinkClient.tsx:171–181` | `FormRow` — the only way parents open Form 01/02 — is a `<div onClick>` without role/tabIndex/keydown. | Convert to `<button>` full-width; keep styling. | S |
| A4 | High | ~40 files with `fixed inset-0` overlays; Escape handled in only 2 (`ClientJobBoardPanel`, `BcbaTreatmentPlanTab`). Parent-facing example `MagicLinkClient.tsx:114–130`; worst staff clusters `IntakeDocumentsTab` (6), `ClinicalReviewTab`/`BillingAuthTab` (5 each), HRM `RbtTasksView` (5) | Modals have no `role="dialog"`, no `aria-modal`, no focus trap, no Escape close; background stays tabbable; overlay close is a `<div onClick>`. | One shared `<Modal>` component (focus trap + Escape + `role="dialog"` + return-focus) and migrate the parent portal + RBT portal modals first, staff tabs opportunistically. | L |
| A5 | High | `apps/crm/src/components/magic-link/FormUIHelpers.tsx:84–91, 123–131, 149–154, 172–177` | Every `AutoSaveInput`/`Date`/`TextArea`/`Select` renders `<label>` as a sibling with no `htmlFor`/`id` — no programmatic name on any parent intake field; SR announces bare "edit text". | Generate an `id` from `fieldId`; `htmlFor` on the label (one change fixes all intake forms). | S |
| A6 | High | Repo-wide: `text-zinc-500` ×547, `text-zinc-600` ×69; Lighthouse-confirmed orange-on-white 2.8:1 on both logins | Contrast: on `bg-zinc-950` (#09090b), `text-zinc-500` ≈ 3.9:1 (fails AA for body text; OK ≥18.7px bold) and `text-zinc-600` ≈ 2.4:1 (fails everywhere). Heavy body-text users: `BcbaTreatmentPlanTab` (96), `BillingAuthTab` (24), `AuthUnitsPanel` (18), `ClientJobBoardPanel` (14), `CaseOpeningsMarketplace` (13). | Policy: `zinc-600` never for text on dark; `zinc-500` only for ≥18.7px-bold or non-essential decoration; promote body metadata to `zinc-400`. Fix the shared login badge/button orange combo once (both apps share the file). | M |
| A7 | Medium | `apps/crm/src/components/layout/Sidebar.tsx:115, 149` | Sidebar expands on **hover only** (`group-hover:w-[252px]`); link labels sit at `opacity-0` until hover — keyboard users tab through invisible links (only `title` tooltips). No `<nav>` landmark, no skip link. HRM's `HrmSidebar` is slightly better (one `role="button"` + `onKeyDown`) but same hover-expand pattern. | Add `focus-within` to every `group-hover:` pair; wrap in `<nav aria-label="Main">`; add a skip-to-content link in both root layouts. | S |
| A8 | Medium | CRM `/login` (and app shells) | Lighthouse `landmark-one-main` + `heading-order`: no `<main>` landmark; heading levels skip. | `<main>` around page content in the layouts; audit `h1→h2→h3` order on the login + portal shells. | S |
| A9 | Medium | ~20 files match icon-only-button pattern (`RbtSessionStudio` ×3, `WeeklyScheduleUnitGrid`/`WeeklyBillableUnitGrid`/`RbtScheduleView` ×2 each, help-desk pages…); `aria-label` exists in only 10 files repo-wide | Icon-only buttons (X, Trash2, Chevron, Plus…) have no accessible name; some have `title` only. | Add `aria-label` at each site; lint with `jsx-a11y/control-has-associated-label`. | M |
| A10 | Low | Both root layouts (`apps/*/src/app/layout.tsx:46–59`) + `globals.css`; `animate-pulse` ×83; zero `prefers-reduced-motion` anywhere | Infinite meteor/star animations and 83 pulsing dots with no reduced-motion opt-out (vestibular/attention issue; WCAG 2.3.3). | One `@media (prefers-reduced-motion: reduce)` block in each `globals.css` disabling star layers + long animations. | S |
| A11 | Low | Repo-wide | `role=` in 4 files; no live regions (`aria-live`) for async save/error states (parent form autosaves silently). | Add `aria-live="polite"` status region to the intake wizard + Studio save flows. | M |

**What's already good:** all `<img>` have alt; `lang="en"` set; `ui/Button.tsx:40` and `ui/Input.tsx:20` have `focus-visible:ring-2`; `RbtSessionStudio` selects are label-wrapped; CLS ≈ 0.

---

## 4. Performance findings (severity-ranked)

| # | Sev | File:line | Issue | Fix | Effort |
|---|-----|-----------|-------|-----|:------:|
| P1 | High | `apps/hrm/src/components/rbt/RbtTasksView.tsx` (114 KB), `emr/RbtSessionStudio.tsx` (86 KB), `public-rbt/RbtApplicationForm.tsx` (74 KB), `crm .../BcbaTreatmentPlanTab.tsx` (74 KB), `rbt/RbtScheduleView.tsx` (60 KB) | Zero `next/dynamic` in either app; 126/184 `.tsx` files are `'use client'`. The five biggest client monoliths all sit on the RBT portal / clinical hot paths — every byte parses on the applicant's phone. | Split each monolith's modal/tab sub-views into `next/dynamic` chunks (modals are ideal: user-triggered); target no single client file > 50 KB source. | L |
| P2 | High | Both apps: `apps/*/src/app/**` | **Zero `loading.tsx`** on any route. Server-component pages that fetch (client profile, portals, ATS) block navigation with a blank screen instead of streaming a skeleton. | Add `loading.tsx` to the slow route groups first: CRM `(dashboard)/client/[id]`, each portal root, HRM `ats/*`, `rbt/*`. Pure-additive, no code-owner conflicts. | S |
| P3 | Medium | `apps/hrm/src/app/ats/help-tickets/page.tsx` (37 KB), `(dashboard)/rbt/help-desk/page.tsx` (36 KB), `ats/applicant/[id]/page.tsx` | Entire `page.tsx` routes are `'use client'` — no server rendering, data fetched client-side, whole page in the bundle. Top-5 offenders only; most other pages correctly split server page → client leaf. | Convert page shell to a server component fetching initial data; keep the interactive queue/chat as a client leaf. | M |
| P4 | Medium | `apps/hrm/src/app/ats/applicant/[id]/page.tsx:797, 818`; `apps/crm/.../BillingAuthTab.tsx:837` | Base64 data-URL documents (`resumeFileDataUrl`, `govtIdFileDataUrl`, intake previews) rendered via `<img src={dataUrl}>` — megabyte strings ride through the DB row → RSC payload → DOM. | Serve via the new signed-URL `/api/documents` route (already built for the private-storage workstream) instead of persisted data-URLs. | M |
| P5 | Low | Both root layouts + `globals.css:116–228` | Always-on fixed-position star layers + infinite meteor animations composite continuously on every page, including the parent portal on low-end phones. (Also A10.) | Honor `prefers-reduced-motion`; consider `content-visibility`/pausing when tab hidden. `professional-matte` theme already disables them — precedent exists. | S |
| P6 | Low | `apps/*/src` (raw `<img>` ×~20; `next/image` used nowhere) | No `next/image` — acceptable for the tiny `/logo.png` uses, but doc-preview images get no lazy-load/size hints. | Leave logos; add `loading="lazy"` + dimensions on doc previews when P4 lands. | S |
| P7 | Low | `apps/hrm/src/lib/pdf/TreatmentPlanPDF.tsx` | Orphaned copy of the CRM PDF template — imports `@react-pdf/renderer` but nothing imports it (CRM's copy is correctly server-only in the generate-report route). Dead-code / accidental-client-import risk. | Delete the HRM copy (gap-6 style cleanup). | S |
| P8 | Info | Dev-only observation | `total-blocking-time` 6.2 s (CRM) / 23 s (HRM) on dev servers; `bodySizeLimit: 200mb` upload DoS surface is already tracked as gap 20 — not re-counted here. | Rerun Lighthouse on prod builds before setting final perf budgets. | — |

---

## 5. Proposed budgets (gate before GA)

Measured on **production builds** (`next build && next start`), mid-tier mobile throttling, per Lighthouse defaults. CI: `lighthouse-ci` or a scripted `npx lighthouse` step; axe via `@axe-core/playwright` once the browser workstream frees up.

| Surface | Lighthouse a11y | Lighthouse perf | LCP | TBT | CLS | axe |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| Parent magic-link portal (`/magic-link/[id]`) | **≥ 95** | ≥ 70 | ≤ 2.5 s | ≤ 300 ms | ≤ 0.1 | 0 critical/serious |
| RBT portal + public apply (HRM `/rbt`, `/apply`) | **≥ 90** | ≥ 70 | ≤ 2.5 s | ≤ 300 ms | ≤ 0.1 | 0 critical/serious |
| Login pages (both) | ≥ 95 | ≥ 75 | ≤ 2.0 s | ≤ 200 ms | ≤ 0.1 | 0 critical/serious |
| Staff dashboards (portals, client profile) | ≥ 85 | ≥ 60 | ≤ 3.0 s | ≤ 500 ms | ≤ 0.1 | 0 critical |

Static budgets: no single `'use client'` source file > 50 KB without `next/dynamic` splitting; every fetching route group has a `loading.tsx`; no new `text-zinc-600` body text on dark backgrounds (lint or review rule).

---

## 6. Top-10 fix list (future wave, in order)

1. **A1** — `sr-only` instead of `hidden` on intake radio/checkbox inputs (`FormUIHelpers.tsx`). Unblocks keyboard parents; S effort.
2. **A2** — Make the parent doc-upload tile a real button + `aria-label` the remove button (`DocumentUploads.tsx`).
3. **A5** — `htmlFor`/`id` binding in the five `AutoSave*` helpers — fixes labeling across all parent intake forms at once.
4. **A3** — `FormRow` div → button (`MagicLinkClient.tsx`).
5. **P2** — Add `loading.tsx` to client profile, portal roots, ATS, RBT routes (pure-additive).
6. **A6** — Contrast pass: kill `text-zinc-600` body text, fix the shared orange login badge/button (both apps), demote `zinc-500` to large/bold-only.
7. **A4** — Shared `<Modal>` (focus trap + Escape + `role="dialog"`), migrate parent + RBT portal modals first.
8. **A7/A8** — Sidebar `focus-within` + `<nav>` + skip link; `<main>` landmark + heading order on logins/shells.
9. **P1** — `next/dynamic`-split `RbtTasksView`, `RbtSessionStudio`, `RbtApplicationForm`, `BcbaTreatmentPlanTab`, `RbtScheduleView`.
10. **A10/P5** — `prefers-reduced-motion` block in both `globals.css` (stars, meteors, pulse dots).

Then: rerun Lighthouse on prod builds, wire budgets into CI, and schedule the axe/Playwright pass (gap 25 close-out).

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-08-12 | Initial a11y + perf audit: static sweep both apps + dev-server Lighthouse on both logins; budgets + top-10 proposed |
