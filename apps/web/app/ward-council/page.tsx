import { redirect } from 'next/navigation';

export default function WardCouncilPage() {
  redirect('/bishopric?type=WARD_COUNCIL');
}
