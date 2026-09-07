'use client';

import React, { useState } from 'react';

// 1. Area Chart Widget (Proportional, Non-Stretched SVG Gradient Area Chart)
export function AreaChartWidget({ 
  title, 
  subtitle, 
  data, 
  color = '#FF7A45',
}: { 
  title: string; 
  subtitle?: string; 
  data: { label: string; value: number }[]; 
  color?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const width = 500;
  const height = 180;
  const paddingX = 30;
  const paddingY = 25;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = 0;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * chartWidth;
    const y = height - paddingY - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${paddingX},${height - paddingY} L ${points.join(' L ')} L ${width - paddingX},${height - paddingY} Z`;
  const lineD = `M ${points.join(' L ')}`;

  return (
    <div className="p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 rounded-2xl space-y-3 shadow-md overflow-hidden max-w-full">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white font-heading">{title}</h4>
          {subtitle && <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
          <span>+14.2%</span>
        </div>
      </div>

      <div className="relative w-full max-w-full overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto max-h-[220px]"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`grad-${title.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="currentColor" className="text-[#E2D5B7]/60 dark:text-white/5" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="currentColor" className="text-[#E2D5B7]/60 dark:text-white/5" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="currentColor" className="text-[#E2D5B7] dark:text-white/10" />

          {/* Gradient Area Fill */}
          <path d={pathD} fill={`url(#grad-${title.replace(/[^a-zA-Z0-9]/g, '')})`} />

          {/* Main Trend Curve */}
          <path d={lineD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Interactive Data Points */}
          {data.map((d, i) => {
            const x = paddingX + (i / (data.length - 1)) * chartWidth;
            const y = height - paddingY - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={hoveredIdx === i ? 6 : 4}
                  fill={color}
                  stroke="#FFFDF8"
                  strokeWidth="2"
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIdx !== null && (
          <div 
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#FFFDF8] dark:bg-zinc-900/95 border border-[#E2D5B7] dark:border-white/20 px-3 py-1 rounded-xl shadow-xl text-[11px] font-mono text-slate-900 dark:text-white pointer-events-none flex items-center gap-2 backdrop-blur-md"
          >
            <span className="text-slate-600 dark:text-zinc-400">{data[hoveredIdx].label}:</span>
            <strong className="text-brand-orange-600 dark:text-brand-orange-400">{data[hoveredIdx].value}</strong>
          </div>
        )}
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-500 pt-1 border-t border-[#E2D5B7]/60 dark:border-white/5">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// 2. Bar Chart Widget (Responsive Glowing Bar Chart)
export function BarChartWidget({ 
  title, 
  subtitle, 
  data 
}: { 
  title: string; 
  subtitle?: string; 
  data: { label: string; value: number; color?: string }[]; 
}) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 rounded-2xl space-y-3 shadow-md overflow-hidden max-w-full">
      <div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white font-heading">{title}</h4>
        {subtitle && <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="space-y-3 pt-1">
        {data.map((d, i) => {
          const pct = Math.round((d.value / maxVal) * 100);
          const barColor = d.color || '#FF7A45';
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-700 dark:text-zinc-300 font-semibold truncate pr-2">{d.label}</span>
                <span className="text-slate-900 dark:text-white font-bold flex-shrink-0">{d.value} ({pct}%)</span>
              </div>
              <div className="w-full bg-[#F9F5EC] dark:bg-zinc-900 h-2.5 rounded-full overflow-hidden p-0.5 border border-[#E2D5B7] dark:border-white/5">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 3. Donut Ring Metric Widget
export function DonutChartWidget({ 
  title, 
  percentage, 
  label, 
  color = '#4FE8CE' 
}: { 
  title: string; 
  percentage: number; 
  label: string; 
  color?: string; 
}) {
  const radius = 34;
  const stroke = 7;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 rounded-2xl flex items-center justify-between shadow-md max-w-full overflow-hidden">
      <div className="space-y-1 min-w-0 pr-3">
        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block truncate">{title}</span>
        <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">{percentage}%</p>
        <p className="text-xs text-slate-600 dark:text-zinc-400 truncate">{label}</p>
      </div>

      <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
        <svg height="64" width="64" className="transform -rotate-90">
          <circle
            stroke="currentColor"
            className="text-[#E2D5B7]/60 dark:text-white/10"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx="32"
            cy="32"
          />
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx="32"
            cy="32"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute text-[11px] font-mono font-bold text-slate-900 dark:text-white">{percentage}%</span>
      </div>
    </div>
  );
}
