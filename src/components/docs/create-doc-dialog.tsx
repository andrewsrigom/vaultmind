'use client';

import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createVaultDocHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import type { Dictionary } from '@/lib/i18n';
import type { FormEvent } from 'react';

type CreateDocDialogProps = {
  className?: string;
  vaultId: string | null;
  vaultSlug?: string | null;
  parentDocId?: string | null;
  strings: Dictionary['appShell']['createDocDialog'];
  workspaceAreaId: string;
};

type CreateDocApiResponse = {
  doc?: {
    id: string;
    slug: string;
  };
  error?: {
    message?: string;
  };
};

function getApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return null;
  }

  const error = (payload as CreateDocApiResponse).error;

  return typeof error?.message === 'string' ? error.message : null;
}

export function CreateDocDialog({
  className,
  parentDocId = null,
  strings,
  vaultId,
  vaultSlug,
  workspaceAreaId,
}: CreateDocDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const trimmedTitle = title.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vaultId || !trimmedTitle || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/vault/${vaultId}/docs`, {
        body: JSON.stringify({
          parentDocId,
          title: trimmedTitle,
          workspaceAreaId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload) ?? strings.error);
      }

      const createdDoc = (payload as CreateDocApiResponse | null)?.doc;

      if (!createdDoc) {
        throw new Error(strings.error);
      }

      toast.success(strings.created);
      setIsOpen(false);
      setTitle('');
      router.push(
        createVaultDocHref({
          docId: createdDoc.id,
          docSlug: createdDoc.slug,
          vaultId,
          vaultSlug,
        }),
      );
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label={strings.trigger}
          className={cn(
            'size-6 rounded-md text-[var(--sidebar-muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[var(--sidebar-ring)]',
            className,
          )}
          disabled={!vaultId}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{strings.title}</DialogTitle>
            <DialogDescription>{strings.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="doc-title">{strings.titleLabel}</Label>
            <div className="relative">
              <FileText
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              />
              <Input
                autoFocus
                className="pl-9"
                id="doc-title"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={strings.placeholder}
                required
                value={title}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => setIsOpen(false)}
              type="button"
              variant="outline"
            >
              {strings.cancel}
            </Button>
            <Button disabled={isSaving || !trimmedTitle} type="submit">
              {isSaving ? strings.creating : strings.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
