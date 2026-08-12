import { RbtAvailabilityView } from '@/components/rbt/RbtAvailabilityView';
import { getMyRbtAvailability } from './actions';

export default async function RbtAvailabilityPage() {
  const initialResult = await getMyRbtAvailability();

  return <RbtAvailabilityView initialResult={initialResult} />;
}
