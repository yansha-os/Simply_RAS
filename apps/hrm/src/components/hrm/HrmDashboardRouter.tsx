'use client';

import React from 'react';
import { useHrmRole } from '@/lib/useHrmRole';
import HeadHrCommandCenter from '@/components/hrm/HeadHrCommandCenter';
import AtsPipelineView from '@/components/hrm/AtsPipelineView';
import PayrollBenefitsView from '@/components/hrm/PayrollBenefitsView';
import RbtPublicLanding from '@/components/public-rbt/RbtPublicLanding';
import RbtTasksView from '@/components/rbt/RbtTasksView';

import HrAgentAnalyticsView from '@/components/hrm/HrAgentAnalyticsView';

export default function HrmDashboardRouter() {
  const { role } = useHrmRole();

  if (role === 'NONE') {
    return <RbtPublicLanding />;
  }

  if (role === 'HR_AGENT') {
    return <HrAgentAnalyticsView />;
  }

  if (role === 'FINANCE') {
    return <PayrollBenefitsView />;
  }

  if (role === 'RBT' || role === 'APPLICANT') {
    return <RbtTasksView />;
  }

  // Default to HEAD_HR Command Center
  return <HeadHrCommandCenter />;
}
