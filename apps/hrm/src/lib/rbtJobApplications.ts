/** Shared key for RBT Job Board applications → Communication unlock. */
export const RBT_JOB_APPS_KEY = 'ras_rbt_job_applications';

export type RbtJobApplication = {
  caseId: string;
  caseCode: string;
  clientInitials: string;
  borough: string;
  neighborhood: string;
  appliedAt: string;
};

export function loadRbtJobApplications(): RbtJobApplication[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RBT_JOB_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRbtJobApplication(app: Omit<RbtJobApplication, 'appliedAt'> & { appliedAt?: string }) {
  if (typeof window === 'undefined') return;
  const list = loadRbtJobApplications();
  const next = [
    ...list.filter((a) => a.caseId !== app.caseId),
    {
      ...app,
      appliedAt: app.appliedAt || new Date().toISOString(),
    },
  ];
  localStorage.setItem(RBT_JOB_APPS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('ras_rbt_jobs_changed'));
}
