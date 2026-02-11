import { RequestAccessForm } from './request-access-form';

export default function RequestAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-semibold">Request Access</h1>
      <p className="text-muted-foreground">
        Tell us about your stake and ward, and a Support Admin will review your request.
      </p>
      <RequestAccessForm />
    </main>
  );
}
