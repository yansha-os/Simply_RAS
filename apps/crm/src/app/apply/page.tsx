import { redirect } from 'next/navigation';

/**
 * The public RBT application lives in HRM (secondary audit L2: the CRM and HRM
 * copies of RbtApplicationForm/publicRbt had forked into two different field
 * sets for the same flow). HRM is the survivor — CRM /apply bounces there,
 * mirroring the /rbt/* and /portal-hr/* redirect pattern.
 */
export default function ApplyRedirect() {
  const base = (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '');
  redirect(`${base}/apply`);
}
