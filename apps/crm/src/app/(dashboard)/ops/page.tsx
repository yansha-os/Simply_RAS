import React from 'react';
import OpsDashboardClient from '@/components/ops/OpsDashboardClient';
import { getOpsDepartmentMetrics } from './actions';

export const dynamic = 'force-dynamic';

export default async function MasterOperationsPortal() {
  const initialResult = await getOpsDepartmentMetrics();

  return <OpsDashboardClient initialResult={initialResult} />;
}
