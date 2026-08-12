import { InterviewExperience } from './InterviewExperience';
import { getInterviewPortalSnapshot } from './actions';

export default async function RbtInterviewPage() {
  const initialResult = await getInterviewPortalSnapshot();
  return <InterviewExperience initialResult={initialResult} />;
}
