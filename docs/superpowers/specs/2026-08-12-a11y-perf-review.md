# Accessibility + Performance Review — CRM & HRM (2026-08-12, gap 25)

Static review of the highest-traffic surfaces: login, client profile tabs, case pipeline, notes pipeline, HRM Session Studio, RBT schedule, magic-link parent portal. Report-first — **no code was changed**. Line numbers reflect the working tree on 2026-08-12 (~03:50); many siblings are editing, so re-verify lines before fixing.

Method: static analysis (grep + file reads) across `apps/crm` and `apps/hrm`. Dev servers were up (`:3000` and `:3001` both returned 200) but the shared browser could not hold a tab (contended with the smoke-test agent), so the optional live axe-style pass was skipped.

## Repo-wide signals

| Signal | Value |
|---|---|
| `'use client'` components | ~130 files (whole route trees are client) |
| `aria-label` usages | 7, across 5 files |
| `htmlFor` usages | 2 in the entire monorepo |
| `aria-live` / `role="status"` / `role="alert"` | 0 |
| `aria-modal` | 1 (`apps/hrm/src/components/rbt/OnboardingConfirmModal.tsx:47`) |
| `fixed inset-0` overlay modals | ~50 across ~22 files; only 5 files handle Escape |
| `next/dynamic` / virtualization libs | 0 |
| `next/image` | 0 (all images are raw `<img>`) |
| `prefers-reduced-motion` | 0 |
| `text-zinc-500/600` on dark surfaces | 77 files |
| Built client JS (CRM `.next/static/chunks`, today) | ~1.9 MB / 44 chunks; largest 333 KB + 233 KB; 200 KB CSS |

Contrast math for the dark theme (`bg-zinc-950` `#09090b`): `text-zinc-400` ≈ 7.6:1 (pass), `text-zinc-500` ≈ **4.0:1 (fails 4.5:1**, and is usually set at 10–11 px), `text-zinc-600` ≈ **2.5:1 (hard fail)** — commonly used for placeholders and metadata.

## Severity-ranked findings

Effort: S < ½ day, M ≈ 1 day, L > 1 day.

### Critical

| # | Location | Issue | Fix | Effort |
|---|---|---|---|---|
| C1 | `apps/crm/src/components/magic-link/FormUIHelpers.tsx:219,258` | `AutoSaveRadio`/`AutoSaveCheckbox` hide the native input with `className="hidden"` (display:none). The visual replacement is a div — radios/checkboxes in the **parent intake wizard are completely keyboard-inoperable** and invisible to AT. | Replace `hidden` with `sr-only` (keeps input focusable), add `focus-visible` ring on the visual proxy via `peer` classes. | S |
| C2 | `apps/crm/src/components/magic-link/MagicLinkClient.tsx:115–137` (pattern repeats in ~22 files, e.g. `IntakeDocumentsTab.tsx:409`, `ClinicalReviewTab.tsx:292`, `ClientScheduleBuilder.tsx:58`) | Custom modals have no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handling; dismissal is backdrop-click only. Keyboard/AT users can neither perceive nor exit the modal; focus stays in the background page. | Introduce one shared `<Modal>` (role=dialog, aria-modal, focus trap, Escape, focus restore) and adopt it in the ~22 files. Only `OnboardingConfirmModal.tsx` (HRM) is close to correct today. | L |
| C3 | `apps/crm/src/components/layout/Sidebar.tsx:115–155`; same pattern `apps/hrm/src/components/layout/HrmSidebar.tsx` | Nav expands on `group-hover` only; link text is `opacity-0` until mouse hover, with no `focus-within` equivalent. Keyboard users tab through links they cannot see. Icon column renders decorative glyphs (`◷ ◍ ▦`) instead of the imported Lucide icons. | Add `group-focus-within:` variants mirroring every `group-hover:` class; render real icons. | S |

### High

| # | Location | Issue | Fix | Effort |
|---|---|---|---|---|
| H1 | Monorepo-wide (2 `htmlFor` total). Examples: `apps/crm/src/app/login/page.tsx:69,82`; `apps/crm/src/components/case/CasePipelineClient.tsx:55–56,65–66`; `apps/crm/src/components/magic-link/FormUIHelpers.tsx:84,123,149,172` | `<label>` elements are never associated with their inputs (no `htmlFor`/`id`, not wrapping). Screen readers announce unlabeled fields; clicking the label does nothing. | Fixing `FormUIHelpers.tsx` alone repairs the whole intake wizard; add `id`+`htmlFor` (derive from `fieldId`). Same for login and staffing selects. | S–M |
| H2 | `apps/hrm/src/components/rbt/RbtStaffCommunicationView.tsx:645` (Send), `apps/crm/src/components/GlobalStaffChat.tsx:139` (Send), modal X buttons at `MagicLinkClient.tsx:134`, `ClientScheduleBuilder.tsx:58`, `IntakeDocumentsTab.tsx:409`, `ClinicalReviewTab.tsx:292` | Icon-only buttons with no accessible name (7 `aria-label`s exist repo-wide; `WeeklyBillableUnitGrid.tsx:202,225` shows the correct pattern). | Add `aria-label="Send message"` / `"Close dialog"` etc. | S |
| H3 | Repo-wide — 0 `aria-live`/`role="status"` | Async state changes (note convert, sign-off, queue counts, `isPending` spinners, `AuthUnitBadge` hard-stop warnings in `NotesPipelineClient.tsx:36–70`) are never announced. Sonner toasts mitigate success/error paths only. | Add one `role="status"` live region per queue surface; put `aria-live="polite"` on badge containers that change after actions. | M |
| H4 | 77 files, e.g. `NotesPipelineClient.tsx:135,238,266,288` (`text-zinc-500` metadata, `placeholder:text-zinc-600`), `ClientProfileTabs.tsx:370–373` | `text-zinc-600` ≈ 2.5:1 and `text-zinc-500` ≈ 4.0:1 on `zinc-950`, mostly at 10–11 px — fails WCAG AA for normal text. | Theme-level sweep: metadata → `zinc-400`, placeholders → `zinc-500` minimum; forbid `zinc-600` as a text color on dark surfaces. | M |
| H5 | `apps/crm/src/components/client-profile/ClientProfileTabs.tsx:142–350`; `NotesPipelineClient.tsx:437–457`; `portal-billing/BillingQueueTabs.tsx` | Tab UIs are plain buttons: no `role="tablist"/"tab"`, no `aria-selected`, no arrow-key navigation; active state is conveyed by color alone. | Add tablist semantics + `aria-selected`; arrow keys optional but cheap once centralized. | M |
| H6 (perf) | `apps/crm/src/app/(dashboard)/portal-case-coord/clients/page.tsx:14–20`; same shape in `portal-billing/clients/page.tsx` | `prisma.client.findMany` with **no `take`, no `select`**, full `bcba`+`rbt` includes, streamed into a client component that filters in memory. Grows unbounded with caseload; no virtualization exists anywhere. | Add `take` + cursor pagination (or at least `select` the ~8 fields the view renders). Contrast: `notes/page.tsx:49–72` already does this right (`take: 100` + separate `count()`s). | M |
| H7 (perf) | `apps/hrm/src/components/emr/RbtSessionStudio.tsx:320–324` | 1,939-line `'use client'` component holds the session clock at its root: `setInterval(() => setSeconds(...), 1000)` re-renders the **entire Studio tree every second** for the whole session. | Move the clock into a tiny leaf `<SessionTimer running startedAt>` component; keep `seconds` out of root state. | M |

### Medium

| # | Location | Issue | Fix | Effort |
|---|---|---|---|---|
| M1 (perf) | `ClientProfileTabs.tsx:6–21` | All 16 tab components imported statically — every profile visit downloads every tab (Session EMR, Treatment Plan, Chart Progress…), even ones never opened. `next/dynamic` is unused repo-wide. | `next/dynamic` the below-the-fold tabs (keep Overview static). | M |
| M2 (perf) | `BillingAuthTab.tsx:837`, `apps/hrm/src/app/ats/applicant/[id]/page.tsx:797,818`, `RbtApplicationForm.tsx:1567` | Document/ID previews render base64 data-URLs through raw `<img>` with no width/height — multi-MB payloads in server-component props and guaranteed layout shift. | Serve uploads by URL (storage route exists: `api/documents/route.ts`), add explicit dimensions or aspect-ratio boxes. | L |
| M3 (perf) | Repo-wide; e.g. `Sidebar.tsx:119`, `login/page.tsx:37` | `next/image` never used. Logos are small (low impact) but eslint's `@next/next/no-img-element` will flag all of these; document previews (M2) are the real cost. | Migrate `<img>` → `next/image` starting with previews. | M |
| M4 | `apps/crm/src/app/layout.tsx:46–52` (star layers + shooting stars on every page), login glow orbs `login/page.tsx:30` (`animate-pulse`), `.dot-live` pulses | Continuous decorative animation on every surface with **no `prefers-reduced-motion` handling anywhere** — vestibular-disorder risk (WCAG 2.3.3) and constant compositor work on low-end devices. | Wrap decorative animation in `@media (prefers-reduced-motion: no-preference)`; consider `motion-reduce:` Tailwind variants. | S |
| M5 | `FormUIHelpers.tsx:50–54` | Admin "stage for rejection" overlay is a click-only `<div onClick>` — no keyboard path, no role, no name. | Make it a `<button aria-pressed>` covering the field. | S |
| M6 | `FormUIHelpers.tsx:97–135` | Masked date input is `type="text"` with silent auto-formatting; no `inputMode="numeric"`, no `aria-describedby` explaining the mask beyond placeholder. | Add `inputMode`, described-by hint text. | S |
| M7 (perf) | `apps/crm/package.json:21`, `apps/hrm/package.json:19` | `framer-motion@12` is declared in both apps but **never imported** — dead dependency (install weight, audit surface; tree-shaken from bundles). | Remove from both manifests. | S |
| M8 | e.g. `NotesPipelineClient.tsx:238,266,288` and most custom inputs | `focus:outline-none` with only a 1px border-color swap as the focus indicator — fails WCAG 2.4.11 focus-appearance expectations. Shared `ui/Button.tsx:40` / `ui/Input.tsx:20` have proper `focus-visible` rings, but dozens of raw `<button>`/`<input>` bypass them. | Prefer shared components; where raw, use `focus-visible:ring-2`. | M |

### Low

| # | Location | Issue | Fix | Effort |
|---|---|---|---|---|
| L1 | Widespread (`ClientProfileTabs.tsx:370`, badges everywhere) | 10px `font-mono` uppercase metadata — below comfortable readability floor, compounds the contrast issue. | Establish 11px minimum, contrast per H4. | M |
| L2 | `Sidebar.tsx:144` | `title` attribute is the only tooltip — not keyboard/touch discoverable. | Covered by C3 fix (visible labels on focus). | S |
| L3 | `ClientProfileTabs.tsx:496` | Emoji inside accessible name ("Top Practitioner 🌟") read aloud by SR. | `aria-hidden` wrap the emoji. | S |
| L4 | `NotesPipelineClient.tsx:130` | `href="#"` fallback link when client id missing — focusable dead link. | Render a `<span>` when no id. | S |

## Top 10 quick wins

1. **`FormUIHelpers.tsx` triple fix** (C1+H1+M5): `sr-only` instead of `hidden` on radio/checkbox inputs, `id`/`htmlFor` from `fieldId`, button-ize the rejection overlay — one file repairs the entire parent intake wizard.
2. `aria-label` on the ~10 icon-only buttons (modal X's, chat Send) — H2, minutes of work.
3. Escape-to-close + `role="dialog" aria-modal="true"` on the three `MagicLinkClient.tsx` modals (parent-facing, highest external traffic) — partial C2.
4. `group-focus-within:` mirror classes on both sidebars — C3.
5. `htmlFor`/`id` on login form labels (first page every user hits) + `role="alert"` on its error div — H1/H3.
6. Sweep `text-zinc-600` → `text-zinc-400/500` for text and placeholders — worst of H4, mechanical find/replace.
7. `take` + `select` on the two unbounded client-list queries (`portal-case-coord/clients`, `portal-billing/clients`) — H6.
8. Extract `<SessionTimer>` leaf in `RbtSessionStudio.tsx` to stop 1 Hz whole-tree re-renders — H7.
9. `motion-reduce:hidden` / reduced-motion media query on layout star layers and pulse animations — M4.
10. Delete unused `framer-motion` from both app manifests — M7.

## Recommended a11y budget / CI check

Current state: flat config at `eslint.config.mjs` extends `eslint-config-next/core-web-vitals`, which already ships a **subset** of `eslint-plugin-jsx-a11y` (`alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`). `eslint-plugin-jsx-a11y` is not a direct dependency, and CI (`.github/workflows/ci.yml:31-34`) runs lint with `continue-on-error: true`.

Proposed budget (incremental, so it can go blocking immediately):

1. Add `eslint-plugin-jsx-a11y` as a root devDependency and enable as **errors** (these have near-zero false positives here):
   - `jsx-a11y/label-has-associated-control` — catches H1 everywhere
   - `jsx-a11y/click-events-have-key-events` + `jsx-a11y/no-static-element-interactions` — catches M5 and backdrop-only modal dismissal
   - `jsx-a11y/no-noninteractive-element-interactions`
   - `jsx-a11y/anchor-is-valid` — catches L4
   - `jsx-a11y/control-has-associated-label` — catches H2 icon-only buttons
2. Split lint into two CI steps: a **blocking** step running only the rule set above on `apps/*/src` (new debt can't land), and the existing non-blocking full lint until legacy debt is cleared.
3. Longer term: one axe smoke (`@axe-core/playwright`) against `/login` and the magic-link portal in the existing connected-product test playbook; fail on `critical` violations only.

## Out of scope / explicitly skipped

- Live browser axe pass — dev servers were up but the shared browser tab was contended; static findings above are unvalidated at runtime.
- Cursor-class violations (workspace UI directive): shared `ui/Button.tsx` handles `cursor-pointer`/`cursor-not-allowed`; raw buttons mostly comply. Not re-audited per task instruction to focus on real a11y.
- Route-level bundle sizes: no `next build` was run (siblings editing); chunk totals above come from today's existing `.next` artifacts (turbopack hashed names, not route-attributable).
