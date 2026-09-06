import PrintMeetingPage from '../print/page';

export default function PublicPreviewPage({
  params
}: {
  params: Promise<{ meetingId: string }>;
}) {
  return <PrintMeetingPage params={params} searchParams={Promise.resolve({ draft: '1' })} />;
}
