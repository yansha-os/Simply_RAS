import React from 'react';
import HrmDashboardRouter from '@/components/hrm/HrmDashboardRouter';

export const metadata = {
  title: 'Rise & Shine ABA HRM Dashboard & Operations Portal',
  description: 'HR Management Portal for Rise & Shine ABA - Staffing, ATS Recruitment, Payroll, and RBT Onboarding.',
};

export default function HrmHomePage() {
  return <HrmDashboardRouter />;
}
