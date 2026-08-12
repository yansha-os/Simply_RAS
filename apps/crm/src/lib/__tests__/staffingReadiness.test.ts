import { describe, expect, it } from 'vitest';

import {
  BCBA_ASSIGN_ELIGIBLE_STATUSES,
  canAssignBcbaAtStatus,
  getStaffingReadiness,
  type StaffingReadinessClient,
} from '../staffingReadiness';

/** Client with all four post-opening gates met, at STAFFING_PENDING. */
function readyClient(overrides: Partial<StaffingReadinessClient> = {}): StaffingReadinessClient {
  return {
    status: 'STAFFING_PENDING',
    bcbaId: 'bcba-1',
    rbtId: null,
    rbtApproved: null,
    treatmentPlan: {
      parentSignature: 'Jane Parent',
      preferredSchedule: { mon: ['15:00'] },
    },
    paRequests: [{ type: 'TREATMENT', status: 'APPROVED' }],
    authorizations: [],
    caseOpenings: [],
    sessions: [],
    ...overrides,
  };
}

describe('getStaffingReadiness — post-opening gates', () => {
  it('is ready to post when signed TP, treatment PA, BCBA, and schedule prefs are all met', () => {
    const res = getStaffingReadiness(readyClient());
    expect(res.canPostOpening).toBe(true);
    expect(res.ready).toBe(true);
    expect(res.nextAction.kind).toBe('publish_opening');
  });

  it('blocks posting and lists every unmet required gate for an empty client', () => {
    const res = getStaffingReadiness({ status: 'INQUIRY' });
    expect(res.canPostOpening).toBe(false);
    expect(res.nextAction.kind).toBe('blocked');
    expect(res.nextAction.blockers).toEqual([
      'Treatment Plan signed by parent',
      'Treatment auth / PA approved',
      'BCBA supervisor assigned',
      'Parent schedule preferences',
    ]);
  });

  it('parses treatmentPlan provided as a JSON string', () => {
    const res = getStaffingReadiness(
      readyClient({
        treatmentPlan: JSON.stringify({
          parentSignature: 'Jane Parent',
          preferredSchedule: { tue: ['10:00'] },
        }),
      })
    );
    expect(res.items.find((i) => i.id === 'signed_tp')?.met).toBe(true);
    expect(res.items.find((i) => i.id === 'schedule_prefs')?.met).toBe(true);
  });

  it('treats a malformed treatmentPlan string as no signature and no prefs', () => {
    const res = getStaffingReadiness(readyClient({ treatmentPlan: '{not json' }));
    expect(res.items.find((i) => i.id === 'signed_tp')?.met).toBe(false);
    expect(res.items.find((i) => i.id === 'schedule_prefs')?.met).toBe(false);
    expect(res.canPostOpening).toBe(false);
  });

  it('does not count an empty preferredSchedule object as schedule prefs', () => {
    const res = getStaffingReadiness(
      readyClient({
        treatmentPlan: { parentSignature: 'Jane', preferredSchedule: {} },
      })
    );
    expect(res.items.find((i) => i.id === 'schedule_prefs')?.met).toBe(false);
  });

  it('accepts treatment PA via an APPROVED authorization row when no PA request exists', () => {
    const res = getStaffingReadiness(
      readyClient({
        status: 'REPORT_ASSEMBLED',
        paRequests: [],
        authorizations: [{ type: 'TREATMENT', status: 'APPROVED' }],
      })
    );
    expect(res.items.find((i) => i.id === 'treatment_pa')?.met).toBe(true);
  });

  it('does not accept an ASSESSMENT authorization as the treatment PA', () => {
    const res = getStaffingReadiness(
      readyClient({
        status: 'REPORT_ASSEMBLED',
        paRequests: [{ type: 'ASSESSMENT', status: 'APPROVED' }],
        authorizations: [],
      })
    );
    expect(res.items.find((i) => i.id === 'treatment_pa')?.met).toBe(false);
  });
});

describe('getStaffingReadiness — next action ladder', () => {
  it('reports active for an ACTIVE client', () => {
    const res = getStaffingReadiness(readyClient({ status: 'ACTIVE' }));
    expect(res.nextAction.kind).toBe('active');
  });

  it('suggests activation when a therapy session exists at STAFFING_PENDING', () => {
    const res = getStaffingReadiness(
      readyClient({
        rbtId: 'rbt-1',
        rbtApproved: true,
        sessions: [{ cptCode: '97153', status: 'SCHEDULED' }],
      })
    );
    expect(res.nextAction.kind).toBe('activate');
  });

  it('does not treat a 97151 assessment session as the first therapy session', () => {
    const res = getStaffingReadiness(
      readyClient({
        rbtId: 'rbt-1',
        rbtApproved: true,
        sessions: [{ cptCode: '97151', status: 'SCHEDULED' }],
      })
    );
    expect(res.nextAction.kind).toBe('schedule_first_session');
    expect(res.items.find((i) => i.id === 'first_session')?.met).toBe(false);
  });

  it('waits on parent approval when an RBT is dispatched but not approved', () => {
    const res = getStaffingReadiness(readyClient({ rbtId: 'rbt-1', rbtApproved: false }));
    expect(res.nextAction.kind).toBe('await_parent');
  });

  it('routes to applicant review while an OPEN listing is live', () => {
    const res = getStaffingReadiness(
      readyClient({ caseOpenings: [{ id: 'o1', status: 'OPEN' }] })
    );
    expect(res.nextAction.kind).toBe('review_applicants');
  });

  it('blocks posting before STAFFING_PENDING even when all post gates are met', () => {
    const res = getStaffingReadiness(readyClient({ status: 'TX_PA_APPROVED' }));
    expect(res.canPostOpening).toBe(true);
    expect(res.nextAction.kind).toBe('blocked');
    expect(res.nextAction.blockers).toEqual([]);
    expect(res.nextAction.label).toContain('STAFFING_PENDING');
  });
});

describe('getStaffingReadiness — first-session schedule gate (Bridge E)', () => {
  it('allows scheduling only at STAFFING_PENDING with parent-approved RBT and BCBA', () => {
    expect(
      getStaffingReadiness(
        readyClient({ rbtId: 'rbt-1', rbtApproved: true })
      ).canScheduleFirstSession
    ).toBe(true);
    expect(
      getStaffingReadiness(
        readyClient({ rbtId: 'rbt-1', rbtApproved: false })
      ).canScheduleFirstSession
    ).toBe(false);
    expect(getStaffingReadiness(readyClient()).canScheduleFirstSession).toBe(false);
    expect(
      getStaffingReadiness(
        readyClient({ rbtId: 'rbt-1', rbtApproved: true, bcbaId: null })
      ).canScheduleFirstSession
    ).toBe(false);
    expect(
      getStaffingReadiness(
        readyClient({ rbtId: 'rbt-1', rbtApproved: true, status: 'ACTIVE' })
      )
        .canScheduleFirstSession
    ).toBe(false);
  });
});

describe('canAssignBcbaAtStatus', () => {
  it('allows every eligible status and refuses earlier ones', () => {
    for (const status of BCBA_ASSIGN_ELIGIBLE_STATUSES) {
      expect(canAssignBcbaAtStatus(status)).toBe(true);
    }
    expect(canAssignBcbaAtStatus('INQUIRY')).toBe(false);
    expect(canAssignBcbaAtStatus('DOCS_SUBMITTED')).toBe(false);
    expect(canAssignBcbaAtStatus(null)).toBe(false);
    expect(canAssignBcbaAtStatus(undefined)).toBe(false);
  });
});
