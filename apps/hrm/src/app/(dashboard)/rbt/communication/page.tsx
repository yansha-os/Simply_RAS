import { assertApplicantHired } from '@/lib/assertApplicantHired';
import { RbtStaffCommunicationView } from '@/components/rbt/RbtStaffCommunicationView';

export default async function RbtCommunicationPage() {
  await assertApplicantHired();
  return <RbtStaffCommunicationView />;
}
