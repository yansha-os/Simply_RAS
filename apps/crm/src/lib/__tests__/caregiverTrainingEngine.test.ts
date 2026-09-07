import { describe, expect, it } from 'vitest';
import {
  analyzeCaregiverProgress,
  validateCaregiverTrainingNote,
  type CaregiverTrainingNotePayload,
} from '../caregiverTrainingEngine';

describe('validateCaregiverTrainingNote', () => {
  const validPayload: CaregiverTrainingNotePayload = {
    caregiverNames: ['Sarah Miller (Mother)'],
    setting: 'HOME',
    sessionMinutes: 60,
    bstSteps: {
      instruction: true,
      modeling: true,
      rehearsal: true,
      feedback: true,
    },
    caregiverFidelityScore: 85,
    goalsAddressed: [
      {
        goalId: 'g-1',
        goalDescription: 'Parent will implement 3-step prompting during transition routines',
        baselineFidelityPct: 40,
        currentFidelityPct: 85,
        status: 'IN_PROGRESS',
      },
    ],
    caregiverReceptivity: 'HIGHLY_RECEPTIVE',
    barriersIdentified: ['Sibling interruptions during homework period'],
    carryoverAssignments: 'Practice 3-step prompt hierarchy at evening mealtime 5 days/week.',
    bcbaClinicalNarrative: 'Parent demonstrated strong procedural fidelity during rehearsal. Provided positive reinforcement and corrective feedback on waiting 5 seconds between prompts.',
  };

  it('validates a complete compliant 97156 note', () => {
    const res = validateCaregiverTrainingNote(validPayload);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.bstCompleted).toBe(true);
    expect(res.fidelityTier).toBe('PROFICIENT');
    expect(res.estimatedUnits).toBe(4);
  });

  it('flags missing BST components and short duration', () => {
    const incomplete = {
      ...validPayload,
      sessionMinutes: 10,
      bstSteps: {
        instruction: true,
        modeling: false,
        rehearsal: false,
        feedback: false,
      },
    };

    const res = validateCaregiverTrainingNote(incomplete);
    expect(res.ok).toBe(false);
    expect(res.bstCompleted).toBe(false);
    expect(res.errors.some((e) => e.includes('15 minutes'))).toBe(true);
    expect(res.errors.some((e) => e.includes('BST'))).toBe(true);
  });

  it('correctly assigns fidelity tiers', () => {
    expect(validateCaregiverTrainingNote({ ...validPayload, caregiverFidelityScore: 95 }).fidelityTier).toBe('EXEMPLARY');
    expect(validateCaregiverTrainingNote({ ...validPayload, caregiverFidelityScore: 80 }).fidelityTier).toBe('PROFICIENT');
    expect(validateCaregiverTrainingNote({ ...validPayload, caregiverFidelityScore: 65 }).fidelityTier).toBe('EMERGING');
    expect(validateCaregiverTrainingNote({ ...validPayload, caregiverFidelityScore: 40 }).fidelityTier).toBe('NEEDS_INTERVENTION');
  });
});

describe('analyzeCaregiverProgress', () => {
  it('computes improving fidelity trajectory and totals', () => {
    const history = [
      { date: '2026-01-05', fidelityScore: 50, minutes: 60 },
      { date: '2026-01-12', fidelityScore: 65, minutes: 60 },
      { date: '2026-01-19', fidelityScore: 80, minutes: 60 },
      {
        date: '2026-01-26',
        fidelityScore: 90,
        minutes: 60,
        goals: [
          {
            goalId: 'g-1',
            goalDescription: 'Transition prompt',
            baselineFidelityPct: 50,
            currentFidelityPct: 90,
            status: 'MASTERED' as const,
          },
          {
            goalId: 'g-2',
            goalDescription: 'Token system carryover',
            baselineFidelityPct: 30,
            currentFidelityPct: 75,
            status: 'IN_PROGRESS' as const,
          },
        ],
      },
    ];

    const stats = analyzeCaregiverProgress(history);
    expect(stats.totalSessionsCount).toBe(4);
    expect(stats.totalTrainingMinutes).toBe(240);
    expect(stats.averageFidelity).toBe(71);
    expect(stats.fidelityTrajectory).toBe('IMPROVING');
    expect(stats.masteredGoalsCount).toBe(1);
    expect(stats.activeGoalsCount).toBe(1);
  });

  it('handles empty session history gracefully', () => {
    const stats = analyzeCaregiverProgress([]);
    expect(stats.totalSessionsCount).toBe(0);
    expect(stats.averageFidelity).toBe(0);
    expect(stats.fidelityTrajectory).toBe('STABLE');
  });
});
