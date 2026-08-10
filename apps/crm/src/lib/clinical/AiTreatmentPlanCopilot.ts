/**
 * AI Clinical Copilot: Treatment Plan Auto-Drafter
 * Phase 10 - Generates draft BCBA Behavior Intervention Plans & Skill Targets from Assessment Scores
 */

export interface AssessmentScoresInput {
  clientName: string;
  ageYears: number;
  assessmentName: 'VB-MAPP' | 'ABLLS-R' | 'AFLS';
  overallScore: number;
  weakestMilestones: string[];
  targetedMaladaptiveBehaviors: string[];
}

export interface GeneratedTreatmentPlanDraft {
  bipSummary: string;
  recommendedSkillTargets: Array<{ domain: string; title: string; criteria: string }>;
  recommendedBRPBehaviors: Array<{ name: string; definition: string; replacement: string }>;
}

export function generateAiTreatmentPlanDraft(input: AssessmentScoresInput): GeneratedTreatmentPlanDraft {
  const skillTargets = input.weakestMilestones.map((m) => ({
    domain: 'Skill Acquisition',
    title: `Expressive & Functional Communication: ${m}`,
    criteria: '80% accuracy across 3 consecutive sessions over 2 staff',
  }));

  const behaviorTargets = input.targetedMaladaptiveBehaviors.map((b) => ({
    name: b,
    definition: `Operational definition for ${b}: any instance of non-functional vocalization or motor resistance lasting >5 seconds.`,
    replacement: `Functional Communication Training (FCT) card exchange or manding for break.`,
  }));

  return {
    bipSummary: `AI Generated BIP Rationale for ${input.clientName}: Based on ${input.assessmentName} assessment scores, client exhibits skill deficits in ${input.weakestMilestones.join(', ')}. Behavior intervention targets function of escape and access to tangibles.`,
    recommendedSkillTargets: skillTargets,
    recommendedBRPBehaviors: behaviorTargets,
  };
}
