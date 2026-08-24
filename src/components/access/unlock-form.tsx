'use client';

import { LockKeyhole, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { Route } from 'next';

type UnlockResponse =
  | {
      error: {
        message: string;
      };
      ok: false;
    }
  | {
      ok: true;
      unlocked: true;
    };

export function UnlockForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function unlockVault(formData: FormData) {
    const password = formData.get('password');

    if (typeof password !== 'string') {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/access/unlock', {
        body: JSON.stringify({ password }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const payload = (await response.json()) as UnlockResponse;

      if (!payload.ok) {
        setErrorMessage(payload.error.message);
        return;
      }

      router.replace(nextPath as Route);
      router.refresh();
    } catch {
      setErrorMessage('VaultMind could not unlock the vault. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form action={unlockVault} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="vault-password">Access password</Label>
        <Input
          autoComplete="current-password"
          autoFocus
          disabled={isSubmitting}
          id="vault-password"
          maxLength={256}
          name="password"
          required
          type="password"
        />
      </div>
      {errorMessage ? (
        <p className="text-sm text-[var(--danger-foreground)]" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
        Unlock vault
      </Button>
    </form>
  );
}
