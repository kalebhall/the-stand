import { LogoutForm } from './logout-form';

export default function LogoutPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Log out</h1>
      <div className="mt-6">
        <LogoutForm />
      </div>
    </main>
  );
}
