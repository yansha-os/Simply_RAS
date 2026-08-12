'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHrmRole } from '@/lib/useHrmRole';
import HeadHrCommandCenter from '@/components/hrm/HeadHrCommandCenter';
import PayrollBenefitsView from '@/components/hrm/PayrollBenefitsView';
import RbtPublicLanding from '@/components/public-rbt/RbtPublicLanding';
import RbtTasksView from '@/components/rbt/RbtTasksView';
import HrAgentAnalyticsView from '@/components/hrm/HrAgentAnalyticsView';

export default function HrmDashboardRouter() {
  const { role } = useHrmRole();
  const router = useRouter();

  // Active RBT staff home is Schedule (not applicant onboarding tasks)
  useEffect(() => {
    if (role === 'RBT') {
      router.replace('/rbt/schedule');
    }
  }, [role, router]);

  if (role === 'NONE') {
    return <RbtPublicLanding />;
  }

  if (role === 'HR_AGENT') {
    return <HrAgentAnalyticsView />;
  }

  if (role === 'FINANCE') {
    return <PayrollBenefitsView />;
  }

  if (role === 'RBT') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Opening RBT schedule…
      </div>
    );
  }

  if (role === 'APPLICANT') {
    return <RbtTasksView />;
  }

  // Default to HEAD_HR Command Center
  return <HeadHrCommandCenter />;
}
