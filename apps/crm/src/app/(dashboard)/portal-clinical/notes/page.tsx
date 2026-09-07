import { redirect } from 'next/navigation';

/** Legacy route — unsigned note co-sign lives on Daily Workstation. */
export default function BcbaUnsignedNotesPage() {
  redirect('/portal-clinical/daily?tab=esign');
}
