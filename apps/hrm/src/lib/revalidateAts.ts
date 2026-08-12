import { revalidatePath } from 'next/cache';

/**
 * Targeted revalidation for ATS / applicant portal.
 * Prefer this over `revalidatePath('/', 'layout')` which remounts the entire app shell.
 */
export function revalidateAtsSurface(options?: {
  candidateId?: string;
  includeRbt?: boolean;
  includeHelpDesk?: boolean;
}) {
  revalidatePath('/ats');
  if (options?.candidateId) {
    revalidatePath(`/ats/applicant/${options.candidateId}`);
  }
  if (options?.includeHelpDesk !== false) {
    revalidatePath('/ats/help-tickets');
  }
  if (options?.includeRbt) {
    revalidatePath('/rbt');
    revalidatePath('/rbt/help-desk');
  }
}
