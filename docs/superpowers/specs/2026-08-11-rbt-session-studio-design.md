# RBT Session Studio — Billable Session Lifecycle Demo

**Date:** 2026-08-11  
**Status:** Approved (full-page route + dual billing checklist + hybrid persist)  
**Owner:** HRM RBT portal (`apps/hrm`)

## Goal

Replace the broken LIVE Schedule → simulation redirect with a **RBT-first Session Studio** that runs a full session end-to-end and only marks notes **claim-ready** when they meet the strictest common **NYS Medicaid + commercial/CASP** fields — so Rise & Shine does not lose money on useless notes.

## Non-goals (this demo)

- Real GPS hardware / state EVV aggregator submission  
- Multi-learner group sessions  
- Live BCBA spectate  
- Replacing the onboarding Motivity simulator (`RbtDataCollectionEngine` stays for `/rbt/simulation`)

## Navigation

Every live EVV session is a **full page** at `/rbt/session/[sessionId]` (no overlay). Schedule launches; Incomplete resumes the same URL. Sidebar/header are hidden on this path (`HrmLayoutWrapper`).

```
Schedule (LIVE) → EVV Start → /rbt/session/[id]
  → 1. Clock in (EVV)
  → 2. Collect (DTT + ABC)
  → 3. Note + Billing readiness checklist
  → 4. Sign & close
       ├─ Checklist incomplete → Incomplete queue + Payroll $ held (+ draft kept)
       └─ Checklist complete → Claim-ready → Session + SessionNote (+ SessionTrialData when SkillTargets)
Incomplete tab → Resume → same /rbt/session/[id] (hydrate draft)
```

## Billing readiness checklist (strictest common fields)

Aligned to common **97153 audit expectations** (Medicaid + commercial / CASP-style docs):

1. Start / end time recorded (supports billed units)  
2. CPT / place of service set  
3. Persons present documented (caregiver Y/N + name if Y)  
4. Treatment-plan goals + objective measurable data (≥1 trial)  
5. Procedures implemented by protocol (intervention checklist)  
6. Client response narrative (≥40 chars — not vague “good session”)  
7. Barriers / safety addressed (even if “None noted”)  
8. Plan for next session  
9. RBT / rendering provider e-signature  
10. Caregiver e-signature (agency payroll gate; many MCO contracts)  
11. Billable units ≥ 1 (8-minute rule display)  

If any fail → blockers shared with Payroll (`ras_rbt_pay_holds`).

## Note structure (not generic SOAP)

Session note phase uses ABA 97153 sections: logistics summary → goals → objective data → procedures → response → barriers → caregiver debrief → plan → signatures. Claim-ready writes this as structured `SessionNote.clinicalContent`.

## UI principles (vs Motivity / Artemis)

- Immersive full-page studio with sticky header (EVV clock) + sticky footer CTAs  
- One phase at a time; fat-finger + / Prompt / −  
- Session-scoped targets (DB SkillTargets when present, else demo goals)  
- Live green/red billing strip after Collect  
- Note auto-fills from data; RBT edits, never starts blank  

## Persistence

- Mid-session: `sessionStorage` draft (`ras_session_studio_draft_*`) + meta (`ras_session_studio_meta_*`)  
- Incomplete / pay holds: `localStorage` (`ras_rbt_pay_holds`)  
- Claim-ready submit: `submitHrmSessionEmrNote` → Session + SessionNote; `SessionTrialData` when trial `targetId` is a real SkillTarget UUID  

## Integration points

- `RbtScheduleView` LIVE: seed upcoming demo sessions; Start → `/rbt/session/[id]`  
- Incomplete tab: Resume Session Studio (not thin fix drawer)  
- Payroll: same hold IDs  
- `/rbt/simulation` unchanged (training Motivity engine)
