import { describe, expect, it } from 'vitest';
import {
  validateProtocolModificationNote,
  type ProtocolModificationNotePayload,
} from '../protocolModificationEngine';

describe('validateProtocolModificationNote', () => {
  const validConcurrentPayload: ProtocolModificationNotePayload = {
    modality: 'CONCURRENT_WITH_RBT',
    sessionMinutes: 60,
    rbtSupervision: {
      rbtUserId: 'rbt-1',
      rbtName: 'Alex Rivers',
      proceduralFidelityScore: 92,
      strengthsObserved: 'Excellent pairing, prompt fading on motor imitation, and fast pacing of trials.',
      correctiveGuidanceProvided: 'Advised on reducing verbal praise latency and using differential reinforcement.',
      followUpCompetencyRequired: false,
    },
    protocolModifications: [
      {
        targetId: 't-1',
        targetTitle: 'Manding for Help',
        previousProcedure: 'Full verbal prompt "I need help" with 0s latency',
        modifiedProcedure: 'Fade to partial verbal "I need..." with 3s expectant pause before prompting',
        clinicalRationale: 'Client reached 90% unprompted imitation; fading to encourage independent initiation.',
      },
    ],
    clientResponseSummary: 'Client successfully initiated 4 independent mands following prompt fading adjustment.',
    bcbaClinicalNarrative: 'Observed RBT Alex conducting DTT session. Modified prompt hierarchy on manding protocol. RBT demonstrated high fidelity following modeling.',
  };

  it('validates a complete compliant concurrent 97155 note', () => {
    const res = validateProtocolModificationNote(validConcurrentPayload);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.estimatedUnits).toBe(4);
    expect(res.isConcurrent).toBe(true);
  });

  it('flags missing RBT supervision details on concurrent modality', () => {
    const invalid = {
      ...validConcurrentPayload,
      rbtSupervision: undefined,
    };

    const res = validateProtocolModificationNote(invalid);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('RBT name and supervision feedback'))).toBe(true);
  });

  it('flags short duration under 15 minutes', () => {
    const res = validateProtocolModificationNote({
      ...validConcurrentPayload,
      sessionMinutes: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('15 minutes'))).toBe(true);
  });

  it('validates direct client modality without requiring RBT feedback', () => {
    const directPayload: ProtocolModificationNotePayload = {
      modality: 'DIRECT_WITH_CLIENT',
      sessionMinutes: 45,
      protocolModifications: [
        {
          targetTitle: 'Tolerating Dentist Tools (Desensitization)',
          previousProcedure: 'Step 3: Toothbrush in mouth for 5s',
          modifiedProcedure: 'Step 4: Disposable dental mirror touch for 3s',
          clinicalRationale: 'Client met mastery criteria on Step 3 for 5 consecutive sessions.',
        },
      ],
      clientResponseSummary: 'Client accepted dental mirror without protest.',
      bcbaClinicalNarrative: 'Direct probe of step 4 desensitization protocol with client prior to training RBT.',
    };

    const res = validateProtocolModificationNote(directPayload);
    expect(res.ok).toBe(true);
    expect(res.isConcurrent).toBe(false);
    expect(res.estimatedUnits).toBe(3);
  });
});
