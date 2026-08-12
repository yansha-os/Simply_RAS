'use server'

import { requireStaff, CASE_COORD_ROLES } from '@/lib/auth-guard'

export async function assignStaff(prevState: unknown, formData: FormData) {
  const gate = await requireStaff(CASE_COORD_ROLES)
  if (!gate.ok) return { error: gate.error }

  // Retained only as a compatibility facade for the legacy Case Pipeline form.
  // Caller-selected RBT/BCBA IDs are no longer accepted here: RBT assignment is
  // established by the audited CaseOpening parent-decision transaction, and
  // BCBA assignment is owned by the expected-current Clinical action.
  void prevState
  void formData
  return {
    error:
      'Direct staff assignment is disabled. Assign the BCBA in Clinical and the RBT through Job Board parent acceptance.',
  }
}
