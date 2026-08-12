import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { bindMagicLinkSession } from '@/app/actions/applicantSessionActions';

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Applicant magic-link landing: bind device fingerprint → ApplicantDeviceSession,
 * then send them into the RBT applicant portal.
 */
export default async function MagicLinkPage({ params }: Props) {
  const { token } = await params;
  const res = await bindMagicLinkSession(token);

  if (!res.success) {
    redirect('/apply?error=invalid_link');
  }

  redirect('/rbt/interview');
}
