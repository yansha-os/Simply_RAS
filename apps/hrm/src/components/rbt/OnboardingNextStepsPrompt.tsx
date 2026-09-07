'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Sparkles,
  Video,
} from 'lucide-react';
import { loadAtsProgress } from '@/lib/syncAtsProgress';

export type OnboardingTabKey =
  | 'TASKS'
  | 'SIMULATION'
  | 'AVAILABILITY'
  | 'INTERVIEW'
  | 'DOCUMENTS';

interface OnboardingNextStepsPromptProps {
  currentTab?: OnboardingTabKey;
  className?: string;
}

interface StepItem {
  key: OnboardingTabKey;
  stepNumber: number;
  title: string;
  detail: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  isComplete: boolean;
  statusLabel: string;
}

export function OnboardingNextStepsPrompt({
  currentTab,
  className = '',
}: OnboardingNextStepsPromptProps) {
  const [progress, setProgress] = useState<{
    tasksDone: boolean;
    simulationDone: boolean;
    availabilityDone: boolean;
    interviewBooked: boolean;
    interviewPassed: boolean;
    certUploaded: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const fetchProgress = async () => {
      try {
        const data = await loadAtsProgress(false);
        if (active && data) {
          setProgress({
            tasksDone: Boolean(data.tasksDone),
            simulationDone: Boolean(data.simulationDone),
            availabilityDone: Boolean(data.availabilityDone),
            interviewBooked: Boolean(data.interviewBooked),
            interviewPassed: Boolean(data.interviewPassed),
            certUploaded: Boolean(data.certUploaded),
          });
        }
      } catch (err) {
        console.warn('Failed to load next steps progress', err);
      }
    };

    void fetchProgress();
    const handleSync = () => void fetchProgress();
    window.addEventListener('rbt_progress_synced', handleSync);
    window.addEventListener('rbt_sim_changed', handleSync);
    window.addEventListener('rbt_availability_changed', handleSync);
    window.addEventListener('rbt_interview_changed', handleSync);
    window.addEventListener('rbt_clearance_changed', handleSync);

    return () => {
      active = false;
      window.removeEventListener('rbt_progress_synced', handleSync);
      window.removeEventListener('rbt_sim_changed', handleSync);
      window.removeEventListener('rbt_availability_changed', handleSync);
      window.removeEventListener('rbt_interview_changed', handleSync);
      window.removeEventListener('rbt_clearance_changed', handleSync);
    };
  }, []);

  const steps: StepItem[] = [
    {
      key: 'TASKS',
      stepNumber: 1,
      title: 'My Tasks & Onboarding Consent',
      detail: 'Complete personal disclosure forms and background check consent.',
      href: '/rbt',
      icon: FileText,
      isComplete: Boolean(progress?.tasksDone),
      statusLabel: progress?.tasksDone ? 'Complete' : 'Pending',
    },
    {
      key: 'SIMULATION',
      stepNumber: 2,
      title: 'Data Collection Simulator',
      detail: 'Practice 5 clinical data-entry procedures with fictional sample cases.',
      href: '/rbt/simulation',
      icon: Activity,
      isComplete: Boolean(progress?.simulationDone),
      statusLabel: progress?.simulationDone ? 'Complete' : 'Pending',
    },
    {
      key: 'AVAILABILITY',
      stepNumber: 3,
      title: 'Weekly Availability Schedule',
      detail: 'Set your recurring ET working hours and travel radius for NYC case matching.',
      href: '/rbt/availability',
      icon: Clock,
      isComplete: Boolean(progress?.availabilityDone),
      statusLabel: progress?.availabilityDone ? 'Complete' : 'Pending',
    },
    {
      key: 'INTERVIEW',
      stepNumber: 4,
      title: 'HR Video Interview',
      detail: 'Schedule and complete your 1-on-1 interview with an HR specialist.',
      href: '/rbt/interview',
      icon: Video,
      isComplete: Boolean(progress?.interviewPassed || progress?.interviewBooked),
      statusLabel: progress?.interviewPassed
        ? 'Approved'
        : progress?.interviewBooked
          ? 'Booked'
          : 'Pending',
    },
    {
      key: 'DOCUMENTS',
      stepNumber: 5,
      title: '40-Hour Course Certificate',
      detail: 'Upload your BACB 40-hour training course completion certificate PDF.',
      href: '/rbt/documents',
      icon: Calendar,
      isComplete: Boolean(progress?.certUploaded),
      statusLabel: progress?.certUploaded ? 'Uploaded' : 'Pending',
    },
  ];

  const otherSteps = steps.filter((step) => step.key !== currentTab);
  const pendingCount = otherSteps.filter((s) => !s.isComplete).length;
  const completedCount = steps.filter((s) => s.isComplete).length;

  return (
    <section
      className={`rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl sm:p-8 ${className}`}
      aria-labelledby="onboarding-next-steps-heading"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-[#E2D5B7] pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-100 text-[#F97316]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2
              id="onboarding-next-steps-heading"
              className="font-heading text-lg font-black text-slate-900 sm:text-xl"
            >
              {pendingCount === 0
                ? 'All Onboarding Requirements Complete!'
                : 'Next Onboarding Requirements'}
            </h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {pendingCount === 0
              ? 'Great job! Your profile is ready for final HR hiring clearance.'
              : `You have completed ${completedCount} of 5 requirements. Continue with the remaining steps below.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-3.5 py-1.5 font-mono text-xs font-black text-slate-700">
            {completedCount} / 5 Complete
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {otherSteps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.key}
              href={step.href}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg ${
                step.isComplete
                  ? 'border-emerald-300/60 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50/80'
                  : 'border-[#E2D5B7] bg-[#F9F5EC]/60 hover:border-[#F97316] hover:bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
                        step.isComplete
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                          : 'border-orange-200 bg-orange-100 text-[#F97316]'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-[10px] font-black uppercase text-slate-500">
                      Step {step.stepNumber}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-black uppercase ${
                      step.isComplete
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        : 'border-orange-300 bg-orange-100 text-[#C2410C]'
                    }`}
                  >
                    {step.isComplete && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                    {step.statusLabel}
                  </span>
                </div>

                <h3 className="mt-3 font-heading text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  {step.title}
                </h3>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                  {step.detail}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-end gap-1 font-heading text-xs font-black text-[#F97316] group-hover:translate-x-0.5 transition-transform">
                <span>{step.isComplete ? 'Review Step' : 'Complete Step'}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
