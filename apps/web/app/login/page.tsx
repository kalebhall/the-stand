export default function LoginPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-muted-foreground">
        Continue with Google or use credentials at <code>/api/auth/signin</code>.
      </p>
    </main>
  );
}
