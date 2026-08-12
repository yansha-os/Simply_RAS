/**
 * Build a BCBA-queue friendly summary from SessionNote.structuredContent (+ clinical fallback).
 * Prefer structured sections so unsigned notes are never blank placeholders.
 * Survives HRM Studio claim-ready submit → CRM `/portal-clinical/notes` queue.
 */

export type NoteModalityCounts = {
  trials: number;
  frequency: number;
  duration: number;
  taskAnalysis: number;
  probes: number;
  abc: number;
};

export type NoteClinicalSummary = {
  goalsAddressed: string | null;
  objectiveData: string | null;
  clientResponse: string | null;
  barriersSafety: string | null;
  planNext: string | null;
  interventions: string[];
  modalityCounts: NoteModalityCounts | null;
  /** Compact trial % / freq lines from structured modalities */
  modalitySummaryLine: string | null;
  cptCode: string | null;
  placeOfServiceLabel: string | null;
  billableUnits: number | null;
  caregiverPresent: boolean | null;
  /** One-line preview for queue cards */
  preview: string;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function stripClinicalHeader(clinical: string): string {
  // Drop boilerplate header lines so preview starts on clinical meat
  const lines = clinical.split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex(
    (l) =>
      l.startsWith('--- Treatment-plan') ||
      l.startsWith('--- Objective') ||
      l.startsWith('--- Client response')
  );
  const body = (start >= 0 ? lines.slice(start) : lines)
    .filter((l) => l && !l.startsWith('===') && l !== '(none listed)' && l !== '(none selected)')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body;
}

function buildModalitySummaryLine(modalities: Record<string, unknown>): string | null {
  const bits: string[] = [];
  const trialsArr = Array.isArray(modalities.trials) ? modalities.trials : [];
  for (const block of trialsArr) {
    const rec = asRecord(block);
    if (!rec) continue;
    const label = str(rec.targetLabel) || 'Target';
    const summary = asRecord(rec.summary);
    if (summary && typeof summary.percentIndependent === 'number') {
      const n = Array.isArray(rec.trials) ? rec.trials.length : 0;
      bits.push(`${label}: ${summary.percentIndependent}% ind (n=${n})`);
    }
  }
  const freq = Array.isArray(modalities.frequency) ? modalities.frequency : [];
  for (const f of freq) {
    const rec = asRecord(f);
    if (!rec) continue;
    const name = str(rec.behaviorName);
    const count = typeof rec.count === 'number' ? rec.count : 0;
    if (name && count > 0) bits.push(`Freq ${name}=${count}`);
  }
  const dur = Array.isArray(modalities.duration) ? modalities.duration : [];
  for (const d of dur) {
    const rec = asRecord(d);
    if (!rec) continue;
    const name = str(rec.behaviorName);
    const total = typeof rec.totalSeconds === 'number' ? rec.totalSeconds : 0;
    if (name && total > 0) bits.push(`Dur ${name}=${total}s`);
  }
  const tas = Array.isArray(modalities.taskAnalysis) ? modalities.taskAnalysis : [];
  for (const ta of tas) {
    const rec = asRecord(ta);
    if (!rec) continue;
    const label = str(rec.targetLabel);
    const pct = typeof rec.percentIndependent === 'number' ? rec.percentIndependent : null;
    if (label && pct != null) bits.push(`TA ${label}: ${pct}%`);
  }
  if (!bits.length) return null;
  return bits.slice(0, 4).join(' · ');
}

export function summarizeSessionNoteForQueue(
  structuredContent: unknown,
  clinicalContent: string | null | undefined
): NoteClinicalSummary {
  const root = asRecord(structuredContent);
  const sections = asRecord(root?.sections);
  const modalities = asRecord(root?.modalities);
  const persons = asRecord(root?.personsPresent);
  const pos = asRecord(root?.placeOfService);

  const goalsAddressed = str(sections?.goalsAddressed) || null;
  let objectiveData = str(sections?.objectiveData) || null;
  const clientResponse = str(sections?.clientResponse) || null;
  const barriersSafety = str(sections?.barriersSafety) || null;
  const planNext = str(sections?.planNext) || null;
  const interventions = Array.isArray(sections?.interventionLabels)
    ? (sections!.interventionLabels as unknown[]).map((x) => str(x)).filter(Boolean)
    : Array.isArray(sections?.interventions)
      ? (sections!.interventions as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];

  let modalityCounts: NoteModalityCounts | null = null;
  let modalitySummaryLine: string | null = null;
  if (modalities) {
    const trialsArr = Array.isArray(modalities.trials) ? modalities.trials : [];
    const trialHits = trialsArr.reduce((sum, block) => {
      const rec = asRecord(block);
      const inner = Array.isArray(rec?.trials) ? rec!.trials.length : 0;
      return sum + inner;
    }, 0);
    modalityCounts = {
      trials: trialHits,
      frequency: Array.isArray(modalities.frequency) ? modalities.frequency.length : 0,
      duration: Array.isArray(modalities.duration) ? modalities.duration.length : 0,
      taskAnalysis: Array.isArray(modalities.taskAnalysis) ? modalities.taskAnalysis.length : 0,
      probes: Array.isArray(modalities.probes) ? modalities.probes.length : 0,
      abc: Array.isArray(modalities.abcEvents) ? modalities.abcEvents.length : 0,
    };
    modalitySummaryLine = buildModalitySummaryLine(modalities);
    // Prefer durable modality summary when section objective text is thin
    if ((!objectiveData || objectiveData.length < 12) && modalitySummaryLine) {
      objectiveData = modalitySummaryLine;
    }
  }

  const cptCode = str(root?.cptCode) || null;
  const placeOfServiceLabel = str(pos?.label) || str(pos?.code) || null;
  const billableUnits =
    typeof root?.billableUnits === 'number' && Number.isFinite(root.billableUnits)
      ? root.billableUnits
      : null;
  const caregiverPresent =
    typeof persons?.caregiverPresent === 'boolean' ? persons.caregiverPresent : null;

  const parts: string[] = [];
  if (cptCode || billableUnits != null) {
    parts.push(
      [cptCode, billableUnits != null ? `${billableUnits}u` : null, placeOfServiceLabel]
        .filter(Boolean)
        .join(' · ')
    );
  }
  if (goalsAddressed) parts.push(`Goals: ${goalsAddressed}`);
  if (objectiveData) parts.push(objectiveData);
  else if (modalitySummaryLine) parts.push(modalitySummaryLine);
  else if (clientResponse) parts.push(clientResponse);
  if (interventions.length) parts.push(`Protocols: ${interventions.slice(0, 3).join(', ')}`);
  if (modalityCounts) {
    const bits = [
      modalityCounts.trials > 0 ? `${modalityCounts.trials} trials` : null,
      modalityCounts.frequency > 0 ? `${modalityCounts.frequency} freq` : null,
      modalityCounts.duration > 0 ? `${modalityCounts.duration} duration` : null,
      modalityCounts.probes > 0 ? `${modalityCounts.probes} probes` : null,
      modalityCounts.abc > 0 ? `${modalityCounts.abc} ABC` : null,
      modalityCounts.taskAnalysis > 0 ? `${modalityCounts.taskAnalysis} TA` : null,
    ].filter(Boolean);
    if (bits.length) parts.push(`Modalities: ${bits.join(' · ')}`);
  }

  let preview = parts.join(' · ').replace(/\s+/g, ' ').trim();
  if (!preview && clinicalContent) {
    preview = stripClinicalHeader(clinicalContent);
  }
  if (!preview) {
    preview = 'Structured session note on file — open Client EMR for full clinical content.';
  }
  if (preview.length > 320) preview = `${preview.slice(0, 320)}…`;

  return {
    goalsAddressed,
    objectiveData,
    clientResponse,
    barriersSafety,
    planNext,
    interventions,
    modalityCounts,
    modalitySummaryLine,
    cptCode,
    placeOfServiceLabel,
    billableUnits,
    caregiverPresent,
    preview,
  };
}
