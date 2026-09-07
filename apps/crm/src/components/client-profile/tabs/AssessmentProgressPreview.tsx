'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { getClientChartProgress, type ChartSkillProgress } from '@/app/actions/chartProgressActions';
import { ClinicalProgressChart, type ClinicalProgressData } from './ClinicalProgressChart';

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function pickPrimarySkill(skills: ChartSkillProgress[]): ChartSkillProgress | null {
  const withData = skills.filter((s) => s.totalTrials > 0);
  if (withData.length === 0) return skills[0] ?? null;
  return [...withData].sort((a, b) => b.totalTrials - a.totalTrials)[0];
}

function toChartData(skill: ChartSkillProgress): ClinicalProgressData {
  const trials = [...skill.recentSessions]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => {
      const pct = s.percentIndependent ?? 0;
      const total = s.trialCount || 1;
      const correct = Math.round((pct / 100) * total);
      const prompted = Math.max(0, total - correct);
      return {
        date: formatShortDate(s.date),
        correct,
        prompted,
        incorrect: 0,
        total,
        percentageIndependent: pct,
      };
    });

  return {
    targetTitle: skill.title,
    targetDomain: skill.domain,
    targetType: 'SKILL',
    trials,
  };
}

export function AssessmentProgressPreview({ clientId }: { clientId: string }) {
  const [skills, setSkills] = useState<ChartSkillProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      const res = await getClientChartProgress(clientId, 20);
      if (res.success) {
        setSkills(res.data.skills);
      } else {
        setError(res.error || 'Failed to load progress.');
      }
      setLoaded(true);
    });
  }, [clientId]);

  const primary = useMemo(() => pickPrimarySkill(skills), [skills]);
  const chartData = useMemo(
    () => (primary ? toChartData(primary) : null),
    [primary],
  );

  if (!loaded || isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 py-10 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
        Loading live trial progress…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
        {error}
      </div>
    );
  }

  if (!primary || !chartData) {
    return (
      <ClinicalProgressChart
        title="Skill acquisition progress"
        subtitle="Live SessionTrialData — sync Clinical Goals first, then collect in Session Studio"
        data={{
          targetTitle: 'No SkillTargets yet',
          targetType: 'SKILL',
          trials: [],
        }}
      />
    );
  }

  const hasTrials = (chartData.trials?.length ?? 0) > 0;

  return (
    <ClinicalProgressChart
      title={primary.title}
      subtitle={
        hasTrials
          ? `Live mastery trend · ${primary.sessionsWithData} session(s) · ${primary.totalTrials} trials`
          : 'SkillTarget synced — awaiting Session Studio trial data'
      }
      data={chartData}
    />
  );
}
