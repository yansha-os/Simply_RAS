'use client';

import React, { useMemo } from 'react';
import { Activity, TrendingUp, BarChart2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export type TrialPoint = {
  date: string;
  correct: number;
  prompted: number;
  incorrect: number;
  total: number;
  percentageIndependent: number;
};

export type BehaviorPoint = {
  date: string;
  count: number;
  durationSeconds: number;
};

export type ClinicalProgressData = {
  targetTitle: string;
  targetDomain?: string;
  targetType: 'SKILL' | 'BEHAVIOR';
  trials?: TrialPoint[];
  behaviors?: BehaviorPoint[];
};

export function ClinicalProgressChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: ClinicalProgressData;
}) {
  const points = useMemo(() => {
    if (data.targetType === 'SKILL') {
      return (data.trials || []).map((t) => ({
        label: t.date,
        val: t.percentageIndependent,
        displayVal: `${t.percentageIndependent.toFixed(0)}%`,
      }));
    }
    return (data.behaviors || []).map((b) => ({
      label: b.date,
      val: b.count,
      displayVal: `${b.count} count`,
    }));
  }, [data]);

  const maxVal = useMemo(() => {
    if (data.targetType === 'SKILL') return 100;
    const max = Math.max(...points.map((p) => p.val), 10);
    return max * 1.2;
  }, [data.targetType, points]);

  if (points.length === 0) {
    return (
      <Card className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-zinc-400">
            <BarChart2 className="h-5 w-5" />
          </span>
          <div>
            <h4 className="font-heading text-sm font-bold text-white">{title}</h4>
            <p className="text-xs text-zinc-400">{subtitle || 'Clinical Target Mastery Progress'}</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-zinc-900/30 p-8 text-center">
          <p className="text-xs font-semibold text-zinc-400">No session trial data logged for this target yet.</p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Trial results submitted from RBT Session Studio will automatically generate progress graphs here.
          </p>
        </div>
      </Card>
    );
  }

  // SVG dimensions
  const height = 180;
  const width = 500;
  const padding = 30;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const pathPoints = points.map((p, i) => {
    const x = padding + (i / Math.max(points.length - 1, 1)) * chartW;
    const y = height - padding - (p.val / maxVal) * chartH;
    return { x, y, ...p };
  });

  const svgPath = pathPoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur-xl">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/[0.05] blur-3xl" />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              data.targetType === 'SKILL'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
            }`}>
              {data.targetType === 'SKILL' ? <TrendingUp className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
            </span>
            <div>
              <h4 className="font-heading text-sm font-bold text-white">{title}</h4>
              <p className="text-[11px] text-zinc-400">
                {data.targetDomain ? `${data.targetDomain} • ` : ''}
                {data.targetType === 'SKILL' ? 'Independent Mastery %' : 'Behavior Frequency'}
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] text-zinc-300">
            {points.length} sessions logged
          </span>
        </div>

        {/* SVG Graph */}
        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
            {/* Grid lines */}
            {[0, 0.5, 1].map((ratio) => {
              const y = height - padding - ratio * chartH;
              return (
                <line
                  key={ratio}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Gradient Fill under line */}
            <defs>
              <linearGradient id={`gradient-${data.targetType}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={data.targetType === 'SKILL' ? '#10b981' : '#f43f5e'}
                  stopOpacity="0.25"
                />
                <stop
                  offset="100%"
                  stopColor={data.targetType === 'SKILL' ? '#10b981' : '#f43f5e'}
                  stopOpacity="0.0"
                />
              </linearGradient>
            </defs>

            {svgPath && (
              <path
                d={`${svgPath} L ${pathPoints[pathPoints.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`}
                fill={`url(#gradient-${data.targetType})`}
              />
            )}

            {/* Line Path */}
            <path
              d={svgPath}
              fill="none"
              stroke={data.targetType === 'SKILL' ? '#10b981' : '#f43f5e'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Points */}
            {pathPoints.map((pt, idx) => (
              <g key={idx} className="group/pt">
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  className={data.targetType === 'SKILL' ? 'fill-emerald-400' : 'fill-rose-400'}
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="7"
                  className={data.targetType === 'SKILL' ? 'stroke-emerald-400/40 fill-none' : 'stroke-rose-400/40 fill-none'}
                  strokeWidth="1.5"
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </Card>
  );
}
