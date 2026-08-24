'use client';

import { PanelLeft, Plus } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createVaultAreaHref } from '@/lib/routes';

import type { Dictionary } from '@/lib/i18n';
import type { FormEvent } from 'react';

type CreateSpaceDialogProps = {
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary['appShell']['createSpaceDialog'];
};

type CreateSpaceApiResponse = {
  area?: {
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

  const error = (payload as CreateSpaceApiResponse).error;

  return typeof error?.message === 'string' ? error.message : null;
}

export function CreateSpaceDialog({ strings, vaultId, vaultSlug }: CreateSpaceDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const trimmedName = name.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vaultId || !trimmedName || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/vault/${vaultId}/areas`, {
        body: JSON.stringify({
          name: trimmedName,
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

      const createdArea = (payload as CreateSpaceApiResponse | null)?.area;

      if (!createdArea) {
        throw new Error(strings.error);
      }

      toast.success(strings.created);
      setIsOpen(false);
      setName('');
      router.push(
        createVaultAreaHref({
          areaId: createdArea.id,
          areaSlug: createdArea.slug,
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
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              aria-label={strings.trigger}
              className="size-7 rounded-md text-[var(--sidebar-muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[var(--sidebar-ring)]"
              disabled={!vaultId}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{strings.trigger}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-xl">
        <form className="grid gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{strings.title}</DialogTitle>
            <DialogDescription>{strings.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="space-name">{strings.nameLabel}</Label>
            <div className="relative">
              <PanelLeft
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              />
              <Input
                autoFocus
                className="pl-9"
                id="space-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder={strings.placeholder}
                required
                value={name}
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
            <Button disabled={isSaving || !trimmedName} type="submit">
              {isSaving ? strings.creating : strings.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
