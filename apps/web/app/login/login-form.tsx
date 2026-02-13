'use client';

import { FormEvent, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeCallbackUrl = useMemo(() => {
    if (!callbackUrl?.startsWith('/')) {
      return '/dashboard';
    }

    return callbackUrl;
  }, [callbackUrl]);

  async function onCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: safeCallbackUrl,
      redirect: false
    });

    setIsSubmitting(false);

    if (!result?.ok) {
      setError('Unable to sign in. Check your email and password and try again.');
      return;
    }

    window.location.assign(result.url ?? safeCallbackUrl);
  }

  function onGoogleSignIn() {
    void signIn('google', { callbackUrl: safeCallbackUrl });
  }

  return (
    <div className="space-y-6 rounded-lg border bg-card p-6 text-card-foreground">
      <button className={cn(buttonVariants(), 'w-full')} onClick={onGoogleSignIn} type="button">
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or use email and password</span>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onCredentialsSubmit}>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="current-password"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <button className={cn(buttonVariants(), 'w-full')} disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
