import { describe, expect, it } from 'vitest';
import { compileReAuthPacketData } from '../reAuthPacketCompiler';

describe('compileReAuthPacketData', () => {
  const client = {
    id: 'client-101',
    firstName: 'Tommy',
    lastName: 'Pickles',
    primaryDiagnosisCode: 'F84.0',
    secondaryDiagnosisCode: 'F80.2',
  };

  const skillTargets = [
    {
      id: 'target-1',
      domain: 'Language / Communication',
      title: 'Vocal Manding for Desired Items',
      baselineData: 20,
      targetStatus: 'IN_PROGRESS',
      masteryCriteria: '80% across 3 sessions',
      trialLogs: [
        { score: '+', promptLevel: 'Independent' },
        { score: '+', promptLevel: 'Independent' },
        { score: '+', promptLevel: 'Independent' },
        { score: '-', promptLevel: 'Verbal' },
      ],
    },
    {
      id: 'target-2',
      domain: 'Social / Play',
      title: 'Turn-Taking with Peers',
      baselineData: 10,
      targetStatus: 'MASTERED',
      trialLogs: [
        { score: '+', promptLevel: 'Independent' },
        { score: '+', promptLevel: 'Independent' },
      ],
    },
  ];

  const behaviorTargets = [
    {
      id: 'beh-1',
      behaviorName: 'Tantrum with Elopement',
      replacementBehavior: 'Functional Communication Training (FCT)',
      behaviorLogs: [
        { frequencyCount: 4 },
        { frequencyCount: 2 },
      ],
    },
  ];

  const caregiverSessions = [
    { fidelityScore: 85, minutes: 60, bstCompleted: true, goalsMasteredCount: 1 },
    { fidelityScore: 90, minutes: 60, bstCompleted: true, goalsMasteredCount: 1 },
  ];

  const sessions = [
    { status: 'COMPLETED', scheduledStart: '2026-01-10T09:00:00Z', scheduledEnd: '2026-01-10T11:00:00Z' },
    { status: 'COMPLETED', scheduledStart: '2026-01-11T09:00:00Z', scheduledEnd: '2026-01-11T11:00:00Z' },
    { status: 'CANCELLED', scheduledStart: '2026-01-12T09:00:00Z', scheduledEnd: '2026-01-12T11:00:00Z' },
  ];

  it('compiles comprehensive re-auth packet payload', () => {
    const packet = compileReAuthPacketData({
      client,
      skillTargets,
      behaviorTargets,
      caregiverSessions,
      sessions,
    });

    expect(packet.clientId).toBe('client-101');
    expect(packet.clientName).toBe('Tommy Pickles');
    expect(packet.diagnosisCodes).toContain('F84.0');
    expect(packet.attendancePct).toBe(66.7); // 2 of 3 completed

    // Skill targets validation
    expect(packet.skillGraphSummary.totalTargetsCount).toBe(2);
    expect(packet.skillGraphSummary.masteredTargetsCount).toBe(1);
    expect(packet.skillGraphSummary.domainBreakdown['Language / Communication']).toBeDefined();

    // Behavior reduction validation
    expect(packet.behaviorGraphSummary.totalBehaviorsCount).toBe(1);
    expect(packet.behaviorGraphSummary.behaviors[0].behaviorName).toBe('Tantrum with Elopement');

    // Caregiver training validation
    expect(packet.caregiverSummary.totalSessions).toBe(2);
    expect(packet.caregiverSummary.totalTrainingHours).toBe(2);
    expect(packet.caregiverSummary.averageFidelityScore).toBe(88);

    // CPT request payload validation
    expect(packet.cptRequestPayload.lines.length).toBeGreaterThanOrEqual(3);
    expect(packet.cptRequestPayload.totalWeeklyHours).toBe(18.5); // 15 + 2 + 1.5
    expect(packet.cptRequestPayload.totalUnitsRequested).toBe(1924); // (15*4 + 2*4 + 1.5*4) * 26 = (60+8+6)*26 = 74*26 = 1924
  });

  it('handles empty clinical targets and sessions defensively', () => {
    const packet = compileReAuthPacketData({
      client: { id: 'c-1', firstName: 'Baby', lastName: 'Doe' },
      skillTargets: [],
      behaviorTargets: [],
      caregiverSessions: [],
      sessions: [],
    });

    expect(packet.skillGraphSummary.totalTargetsCount).toBe(0);
    expect(packet.behaviorGraphSummary.totalBehaviorsCount).toBe(0);
    expect(packet.attendancePct).toBe(95.0);
    expect(packet.diagnosisCodes).toContain('F84.0 (Autism Spectrum Disorder)');
  });
});
