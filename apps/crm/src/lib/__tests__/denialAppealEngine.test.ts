import { describe, expect, it } from 'vitest';
import {
  compileDenialAppealPacket,
  summarizeDenialPlaybookHints,
  type DenialAppealInput,
} from '../denialAppealEngine';

describe('compileDenialAppealPacket', () => {
  const baseInput: DenialAppealInput = {
    claimId: 'CLM-100294',
    clientName: 'Julian Alvarez',
    clientDob: '2019-04-12',
    memberId: 'MED-994821',
    payerName: 'Empire BlueCross BlueShield',
    dateOfService: '2026-05-15',
    cptCode: '97153',
    billedUnits: 8,
    billedAmountDollar: 220.0,
    denialCode: 'CO-197',
    authNumber: 'PA-2026-8831',
    bcbaName: 'Dr. Sarah Connor',
    customRebuttalNotes: 'Auth was approved on 2026-01-01 and was active through 2026-06-30.',
  };

  it('compiles an authorization appeal packet (CO-197)', () => {
    const packet = compileDenialAppealPacket(baseInput);

    expect(packet.claimId).toBe('CLM-100294');
    expect(packet.payerName).toBe('Empire BlueCross BlueShield');
    expect(packet.headerDetails.authNumber).toBe('PA-2026-8831');
    expect(packet.denialSummary.code).toBe('CO-197');
    expect(packet.appealNarrative).toContain('PA-2026-8831');
    expect(packet.appealNarrative).toContain('Additional Clinical Context');
    expect(packet.attachedEvidenceChecklist).toHaveLength(4);
    expect(packet.bcbaAttestation).toContain('Dr. Sarah Connor');
  });

  it('compiles medical necessity appeal packet (CO-50)', () => {
    const packet = compileDenialAppealPacket({
      ...baseInput,
      denialCode: 'CO-50',
    });

    expect(packet.denialSummary.code).toBe('CO-50');
    expect(packet.appealNarrative).toContain('F84.0');
    expect(packet.appealNarrative).toContain('medically necessary');
  });

  it('handles unknown denial reason codes gracefully', () => {
    const packet = compileDenialAppealPacket({
      ...baseInput,
      denialCode: 'CUSTOM-999',
      denialReasonText: 'Provider not enrolled on date of service.',
    });

    expect(packet.denialSummary.code).toBe('CUSTOM-999');
    expect(packet.denialSummary.reason).toBe('Provider not enrolled on date of service.');
  });
});

describe('summarizeDenialPlaybookHints', () => {
  it('returns top CARC coaching rows with checklist hints', () => {
    const hints = summarizeDenialPlaybookHints(3);
    expect(hints).toHaveLength(3);
    expect(hints[0].code).toBe('CO-197');
    expect(hints[0].checklistHint.length).toBeGreaterThan(10);
  });
});
