import { describe, expect, it } from 'vitest';

import {
  brpGoalsToBehaviorTargetPayloads,
  evaluateMastery,
  isCollectActiveStatus,
  mapGoalStatusToSkillTargetStatus,
  parseClinicalGoalsFromTreatmentPlan,
  parseMasteryCriteria,
  skillGoalsToSkillTargetPayloads,
  SKILL_TARGET_STATUSES,
  type ClinicalBrpGoal,
  type ClinicalSkillGoal,
} from '../clinicalGoals';

const samplePlan = {
  status: 'SUBMITTED',
  bcbaSubmittedAt: '2026-08-10T12:00:00.000Z',
  langCommSeverity: 'Moderate',
  langCommDescription: 'Limited manding repertoire.',
  skillGoals: [
    {
      domain: 'Language',
      description: 'Mands for 5 preferred items',
      mastery: '80% over 3 sessions',
      baseline: '20%',
      currentLevel: '45%',
      targetDate: '2026-12-01',
      status: 'Continuing',
    },
    {
      domain: '',
      description: '',
      status: 'New',
    },
  ],
  brp: [
    {
      behavior: 'Elopement',
      function: 'Escape',
      mastery: '<1 per week',
      baseline: '4 per day',
      risk: 'High',
      status: 'Mastered',
    },
  ],
  parentGoals: [
    {
      description: 'Caregiver implements token board',
      mastery: '90% fidelity',
      status: 'New',
    },
  ],
};

describe('parseClinicalGoalsFromTreatmentPlan', () => {
  it('parses object plans into a snapshot with counts', () => {
    const snap = parseClinicalGoalsFromTreatmentPlan(samplePlan);
    expect(snap.hasPlan).toBe(true);
    expect(snap.planStatus).toBe('SUBMITTED');
    expect(snap.counts).toEqual({
      total: 4,
      skill: 2,
      brp: 1,
      parent: 1,
      mastered: 1,
      active: 3,
    });
    expect(snap.skillGoals[0].domain).toBe('Language');
    expect(snap.skillGoals[1].domain).toBe('Unassigned');
    expect(snap.brpGoals[0].risk).toBe('High');
  });

  it('parses JSON-string plans the same as objects', () => {
    const fromString = parseClinicalGoalsFromTreatmentPlan(JSON.stringify(samplePlan));
    const fromObject = parseClinicalGoalsFromTreatmentPlan(samplePlan);
    expect(fromString).toEqual(fromObject);
  });

  it('returns an empty snapshot for null / invalid / array input', () => {
    for (const raw of [null, undefined, 'not-json', 42, ['a']]) {
      const snap = parseClinicalGoalsFromTreatmentPlan(raw);
      expect(snap.hasPlan).toBe(false);
      expect(snap.counts.total).toBe(0);
      expect(snap.skillGoals).toEqual([]);
      expect(snap.brpGoals).toEqual([]);
      expect(snap.parentGoals).toEqual([]);
    }
  });

  it('defaults goal status to New and BRP risk to Low', () => {
    const snap = parseClinicalGoalsFromTreatmentPlan({
      skillGoals: [{ description: 'x' }],
      brp: [{ behavior: 'y' }],
    });
    expect(snap.skillGoals[0].status).toBe('New');
    expect(snap.brpGoals[0].risk).toBe('Low');
  });
});

describe('mapGoalStatusToSkillTargetStatus', () => {
  it('maps TP statuses to Studio target statuses', () => {
    expect(mapGoalStatusToSkillTargetStatus('Mastered')).toBe('MASTERED');
    expect(mapGoalStatusToSkillTargetStatus('On Hold')).toBe('ON_HOLD');
    expect(mapGoalStatusToSkillTargetStatus('Continuing')).toBe('IN_PROGRESS');
    expect(mapGoalStatusToSkillTargetStatus('New')).toBe('BASELINE');
    expect(mapGoalStatusToSkillTargetStatus('anything else')).toBe('BASELINE');
  });
});

describe('isCollectActiveStatus', () => {
  it('only BASELINE and IN_PROGRESS stay visible in Studio Collect', () => {
    expect(isCollectActiveStatus('BASELINE')).toBe(true);
    expect(isCollectActiveStatus('IN_PROGRESS')).toBe(true);
    expect(isCollectActiveStatus('in_progress')).toBe(true);
    expect(isCollectActiveStatus('MASTERED')).toBe(false);
    expect(isCollectActiveStatus('ON_HOLD')).toBe(false);
    expect(isCollectActiveStatus('DISCONTINUED')).toBe(false);
    expect(isCollectActiveStatus('')).toBe(false);
  });

  it('every allowed status constant resolves deterministically', () => {
    for (const status of SKILL_TARGET_STATUSES) {
      expect(typeof isCollectActiveStatus(status)).toBe('boolean');
    }
  });
});

describe('skillGoalsToSkillTargetPayloads', () => {
  const goal = (over: Partial<ClinicalSkillGoal>): ClinicalSkillGoal => ({
    kind: 'skill',
    domain: 'Language',
    description: 'Mands for items',
    mastery: '80% over 3 sessions',
    baseline: '20%',
    currentLevel: '45%',
    targetDate: '2026-12-01',
    status: 'Continuing',
    ...over,
  });

  it('builds payloads and skips goals with empty descriptions', () => {
    const payloads = skillGoalsToSkillTargetPayloads([goal({}), goal({ description: '  ' })]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      domain: 'Language',
      title: 'Mands for items',
      measurementType: 'TRIAL',
      targetStatus: 'IN_PROGRESS',
      masteryCriteria: '80% over 3 sessions',
      baselineData: 20,
    });
    expect(payloads[0].description).toContain('Current: 45%');
    expect(payloads[0].description).toContain('Target date: 2026-12-01');
  });

  it('defaults mastery criteria and null baseline when missing', () => {
    const [p] = skillGoalsToSkillTargetPayloads([
      goal({ mastery: '', baseline: 'not a number', currentLevel: '', targetDate: '' }),
    ]);
    expect(p.masteryCriteria).toBe('80% over 3 sessions');
    expect(p.baselineData).toBeNull();
    expect(p.description).toBeNull();
  });
});

describe('brpGoalsToBehaviorTargetPayloads', () => {
  const brp = (over: Partial<ClinicalBrpGoal>): ClinicalBrpGoal => ({
    kind: 'brp',
    behavior: 'Elopement',
    function: 'Escape',
    mastery: '<1 per week',
    baseline: '4 per day',
    currentLevel: '',
    targetDate: '',
    status: 'Continuing',
    risk: 'High',
    ...over,
  });

  it('builds definition from parts and skips empty behavior names', () => {
    const payloads = brpGoalsToBehaviorTargetPayloads([brp({}), brp({ behavior: '' })]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].behaviorName).toBe('Elopement');
    expect(payloads[0].measurementType).toBe('FREQUENCY');
    expect(payloads[0].definition).toBe(
      'Function: Escape · Mastery: <1 per week · Baseline: 4 per day · Risk: High',
    );
  });

  it('falls back to a generic definition when all parts are empty', () => {
    const [p] = brpGoalsToBehaviorTargetPayloads([
      brp({ function: '', mastery: '', baseline: '', risk: '' }),
    ]);
    expect(p.definition).toBe('Behavior reduction target: Elopement');
  });
});

describe('parseMasteryCriteria', () => {
  it('parses "80% over 3 sessions"', () => {
    expect(parseMasteryCriteria('80% over 3 sessions')).toEqual({ percent: 80, sessions: 3 });
  });

  it('parses consecutive-days phrasing', () => {
    expect(parseMasteryCriteria('90% across 2 consecutive days')).toEqual({
      percent: 90,
      sessions: 2,
    });
  });

  it('defaults to 1 session when no window is given', () => {
    expect(parseMasteryCriteria('85%')).toEqual({ percent: 85, sessions: 1 });
  });

  it('returns null for empty, non-percent, or out-of-range criteria', () => {
    expect(parseMasteryCriteria(null)).toBeNull();
    expect(parseMasteryCriteria('')).toBeNull();
    expect(parseMasteryCriteria('independent responding')).toBeNull();
    expect(parseMasteryCriteria('150% over 3 sessions')).toBeNull();
    expect(parseMasteryCriteria('0% over 3 sessions')).toBeNull();
  });
});

describe('evaluateMastery', () => {
  const criteria = '80% over 3 sessions';

  it('returns no-criteria when the criteria is unparseable', () => {
    expect(evaluateMastery('run fast', [90, 90, 90])).toEqual({ state: 'no-criteria' });
  });

  it('returns no-data when there are no scoreable session percents', () => {
    expect(evaluateMastery(criteria, [])).toEqual({ state: 'no-data', percent: 80, sessions: 3 });
    expect(evaluateMastery(criteria, [null, null])).toEqual({
      state: 'no-data',
      percent: 80,
      sessions: 3,
    });
  });

  it('reports met when the most recent streak reaches the required window', () => {
    expect(evaluateMastery(criteria, [85, 80, 90, 40])).toEqual({
      state: 'met',
      percent: 80,
      sessions: 3,
      streak: 3,
    });
  });

  it('reports on-track for a shorter streak and below when the latest session misses', () => {
    expect(evaluateMastery(criteria, [85, 40, 90])).toEqual({
      state: 'on-track',
      percent: 80,
      sessions: 3,
      streak: 1,
    });
    expect(evaluateMastery(criteria, [40, 90, 90])).toEqual({
      state: 'below',
      percent: 80,
      sessions: 3,
      streak: 0,
    });
  });

  it('skips null percents without breaking the streak', () => {
    expect(evaluateMastery(criteria, [85, null, 80, 90])).toEqual({
      state: 'met',
      percent: 80,
      sessions: 3,
      streak: 3,
    });
  });
});
