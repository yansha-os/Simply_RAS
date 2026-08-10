/**
 * 30-Day Prior Auth (PA) Re-Authorization & Progress Auto-Compiler Engine
 * Phase 9 - Clinical Re-Auth Package Compiler
 */

export interface ReAuthCompilerInput {
  clientId: string;
  clientName: string;
  payerName: string;
  currentAuthNumber: string;
  expirationDate: string; // YYYY-MM-DD
  totalSessionsLogged: number;
  attendedSessions: number;
  masteredSkillTargetsCount: number;
  inProgressTargetsCount: number;
  brpReductionPct: number; // e.g. 45% reduction in tantrums
}

export interface ReAuthPacketSummary {
  daysUntilExpiration: number;
  isTriggered30DayNotice: boolean;
  attendancePct: number;
  compiledSkillSummary: string;
  compiledBehaviorSummary: string;
  recommendedCptUnits: Array<{ cptCode: string; description: string; unitsRequested: number }>;
}

export function compileReAuthPacket(input: ReAuthCompilerInput): ReAuthPacketSummary {
  const expTime = new Date(input.expirationDate).getTime();
  const now = new Date().getTime();
  const daysLeft = Math.ceil((expTime - now) / (1000 * 3600 * 24));
  const attendancePct = input.totalSessionsLogged > 0 ? Math.round((input.attendedSessions / input.totalSessionsLogged) * 100) : 100;

  return {
    daysUntilExpiration: daysLeft,
    isTriggered30DayNotice: daysLeft <= 30,
    attendancePct,
    compiledSkillSummary: `Client mastered ${input.masteredSkillTargetsCount} skill targets over the last 6-month period. ${input.inProgressTargetsCount} targets currently in progress with steady learning trajectory.`,
    compiledBehaviorSummary: `Behavior Reduction Program demonstrated a ${input.brpReductionPct}% overall reduction in targeted maladaptive behaviors (aggression/tantrums).`,
    recommendedCptUnits: [
      { cptCode: '97151', description: 'Behavior Identification Assessment', unitsRequested: 32 },
      { cptCode: '97153', description: 'Adaptive Behavior Treatment by Protocol (RBT)', unitsRequested: 480 },
      { cptCode: '97155', description: 'Adaptive Behavior Treatment Protocol Modification (BCBA)', unitsRequested: 96 },
      { cptCode: '97156', description: 'Family Adaptive Behavior Treatment Guidance', unitsRequested: 32 },
    ],
  };
}
