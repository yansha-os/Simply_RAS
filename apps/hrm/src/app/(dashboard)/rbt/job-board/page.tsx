import { assertApplicantHired } from '@/lib/assertApplicantHired';
import { RbtJobBoardView } from '@/components/rbt/RbtJobBoardView';
import { listOpenCaseOpeningsForRbt } from '@/app/actions/caseOpeningActions';
import { toJobBoardListing } from './jobBoardUi';

export default async function RbtJobBoardPage() {
  await assertApplicantHired();
  const result = await listOpenCaseOpeningsForRbt();

  return (
    <RbtJobBoardView
      openings={result.openings.map(toJobBoardListing)}
      travelProfile={result.travelProfile}
      loadError={result.success ? null : result.error || 'Failed to load the job board.'}
    />
  );
}
