import { describe, expect, it } from 'vitest';

import { summarizeSessionNoteForQueue } from '../sessionNoteSummary';

const structuredBase = {
  cptCode: '97153',
  billableUnits: 4,
  placeOfService: { code: '12', label: 'Home' },
  personsPresent: { client: true, caregiverPresent: true },
  sections: {
    goalsAddressed: 'Mand training; Listener responding',
    objectiveData: 'Mand: 8/10 independent across trials this session.',
    clientResponse: 'Responded to prompt fading with increasing independence.',
    barriersSafety: 'None noted.',
    planNext: 'Continue prompt fade on mand targets.',
    interventionLabels: ['DTT', 'NET', 'Prompt fading', 'Extra protocol'],
  },
  modalities: {
    trials: [
      {
        targetLabel: 'Mand',
        trials: [{}, {}, {}],
        summary: { percentIndependent: 67 },
      },
      { targetLabel: 'Listener', trials: [{}, {}], summary: { percentIndependent: 50 } },
    ],
    frequency: [{ behaviorName: 'Elopement', count: 2 }],
    duration: [{ behaviorName: 'Flopping', totalSeconds: 90 }],
    taskAnalysis: [{ targetLabel: 'Handwashing', percentIndependent: 40 }],
    probes: [{ targetLabel: 'Colors' }],
    abcEvents: [{}],
  },
};

describe('summarizeSessionNoteForQueue — structured content', () => {
  it('extracts sections, header fields, and caregiver flag', () => {
    const s = summarizeSessionNoteForQueue(structuredBase, null);
    expect(s.goalsAddressed).toBe('Mand training; Listener responding');
    expect(s.cptCode).toBe('97153');
    expect(s.billableUnits).toBe(4);
    expect(s.placeOfServiceLabel).toBe('Home');
    expect(s.caregiverPresent).toBe(true);
    expect(s.interventions).toEqual(['DTT', 'NET', 'Prompt fading', 'Extra protocol']);
  });

  it('counts modalities with trial hits summed across blocks', () => {
    const s = summarizeSessionNoteForQueue(structuredBase, null);
    expect(s.modalityCounts).toEqual({
      trials: 5,
      frequency: 1,
      duration: 1,
      taskAnalysis: 1,
      probes: 1,
      abc: 1,
    });
  });

  it('builds a compact modality summary line from trials, frequency, duration, and TA', () => {
    const s = summarizeSessionNoteForQueue(structuredBase, null);
    expect(s.modalitySummaryLine).toContain('Mand: 67% ind (n=3)');
    expect(s.modalitySummaryLine).toContain('Freq Elopement=2');
    // capped at 4 segments
    expect(s.modalitySummaryLine!.split(' · ').length).toBeLessThanOrEqual(4);
  });

  it('replaces thin objective text with the durable modality summary line', () => {
    const thin = {
      ...structuredBase,
      sections: { ...structuredBase.sections, objectiveData: 'short' },
    };
    const s = summarizeSessionNoteForQueue(thin, null);
    expect(s.objectiveData).toBe(s.modalitySummaryLine);
  });

  it('limits the protocols preview to the first three interventions', () => {
    const s = summarizeSessionNoteForQueue(structuredBase, null);
    expect(s.preview).toContain('Protocols: DTT, NET, Prompt fading');
    expect(s.preview).not.toContain('Extra protocol');
  });

  it('nulls billableUnits when it is not a finite number', () => {
    expect(
      summarizeSessionNoteForQueue({ ...structuredBase, billableUnits: 'four' }, null)
        .billableUnits
    ).toBeNull();
    expect(
      summarizeSessionNoteForQueue({ ...structuredBase, billableUnits: Number.NaN }, null)
        .billableUnits
    ).toBeNull();
  });

  it('truncates previews longer than 320 characters with an ellipsis', () => {
    const long = {
      sections: { goalsAddressed: 'G'.repeat(400) },
    };
    const s = summarizeSessionNoteForQueue(long, null);
    expect(s.preview.length).toBe(321);
    expect(s.preview.endsWith('…')).toBe(true);
  });
});

describe('summarizeSessionNoteForQueue — fallbacks', () => {
  it('falls back to a stable placeholder when nothing usable exists', () => {
    const s = summarizeSessionNoteForQueue(null, null);
    expect(s.preview).toContain('Structured session note on file');
    expect(s.goalsAddressed).toBeNull();
    expect(s.modalityCounts).toBeNull();
    expect(s.caregiverPresent).toBeNull();
  });

  it('strips boilerplate headers from legacy clinical content previews', () => {
    const clinical = [
      '=== CPT 97153 SESSION NOTE (Adaptive Behavior Treatment by Protocol) ===',
      'Client: Kid A',
      '--- Objective data (measurable) ---',
      'Mand: 4 independent / 1 prompted (80% independent, n=5).',
      '(none listed)',
    ].join('\n');
    const s = summarizeSessionNoteForQueue(null, clinical);
    expect(s.preview).toContain('Mand: 4 independent');
    expect(s.preview).not.toContain('===');
    expect(s.preview).not.toContain('(none listed)');
    expect(s.preview).not.toContain('Client: Kid A');
  });

  it('ignores arrays and primitives passed as structuredContent', () => {
    expect(summarizeSessionNoteForQueue([1, 2, 3], null).modalityCounts).toBeNull();
    expect(summarizeSessionNoteForQueue('a string', null).goalsAddressed).toBeNull();
  });
});
