import OfflineStandPage from './offline-stand-page';

export default async function OfflineStandRoute({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <OfflineStandPage meetingId={meetingId} />;
}
