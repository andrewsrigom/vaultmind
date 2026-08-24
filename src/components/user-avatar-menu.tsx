'use client';

import { Check, Code2, Languages, LockKeyhole, Moon, Settings, Vault } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { createVaultSettingsHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import type { Dictionary, Locale } from '@/lib/i18n';

type UserAvatarMenuProps = {
  accessLockEnabled?: boolean;
  align?: 'left' | 'right';
  labels: {
    localeSwitch: Dictionary['appShell']['localeSwitch'];
    userMenu: Dictionary['userMenu'];
  };
  locale: Locale;
  selectedVaultId: string | null;
  variant?: 'icon' | 'sidebar';
};

const localeOptions = [
  { labelKey: 'ptBR', value: 'pt-BR' },
  { labelKey: 'en', value: 'en' },
] as const;

export function UserAvatarMenu({
  accessLockEnabled = false,
  align = 'right',
  labels,
  locale,
  selectedVaultId,
  variant = 'icon',
}: UserAvatarMenuProps) {
  const router = useRouter();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isLocking, setIsLocking] = useState(false);
  const [isUpdatingLocale, setIsUpdatingLocale] = useState(false);
  const settingsHref = createVaultSettingsHref({
    vaultId: selectedVaultId,
  });
  const isSidebarVariant = variant === 'sidebar';

  async function updateLocale(nextLocale: Locale) {
    if (nextLocale === locale || isUpdatingLocale) {
      return;
    }

    setIsUpdatingLocale(true);

    try {
      await fetch('/api/locale', {
        body: JSON.stringify({ locale: nextLocale }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      router.refresh();
    } finally {
      setIsUpdatingLocale(false);
    }
  }

  async function lockVault() {
    if (isLocking) {
      return;
    }

    setIsLocking(true);

    try {
      await fetch('/api/access/unlock', { method: 'DELETE' });
      router.replace('/unlock');
      router.refresh();
    } finally {
      setIsLocking(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Personal vault menu"
          className={cn(
            'transition focus-visible:ring-2',
            isSidebarVariant
              ? 'h-12 w-full min-w-0 justify-start gap-3 rounded-md px-2 text-sm font-medium text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[var(--sidebar-ring)] data-[state=open]:bg-[var(--sidebar-accent)]'
              : 'size-10 rounded-full border border-[var(--border)] bg-[var(--card)] p-0 text-[var(--foreground)] hover:bg-[var(--muted)]',
          )}
          type="button"
          variant="ghost"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-accent)]">
            <Vault aria-hidden="true" className="size-4" />
          </span>
          {isSidebarVariant ? (
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-medium">Personal vault</span>
              <span className="truncate text-xs text-[var(--sidebar-muted-foreground)]">
                Local instance
              </span>
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align === 'left' ? 'start' : 'end'}
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg"
        side={isSidebarVariant ? 'top' : 'bottom'}
        sideOffset={8}
      >
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={settingsHref}>
            <Settings aria-hidden="true" className="mr-2 size-4" />
            {labels.userMenu.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href="https://github.com/andrewsrigom/vaultmind" rel="noreferrer" target="_blank">
            <Code2 aria-hidden="true" className="mr-2 size-4" />
            {labels.userMenu.sourceCode}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          <Moon aria-hidden="true" className="mr-2 size-4" />
          {labels.userMenu.darkMode}
          <Switch
            aria-hidden="true"
            checked={isDarkMode}
            className="ml-auto pointer-events-none"
            tabIndex={-1}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Languages aria-hidden="true" className="size-4" />
          {labels.userMenu.language}
        </DropdownMenuLabel>
        {localeOptions.map((item) => (
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isUpdatingLocale}
            key={item.value}
            onSelect={(event) => {
              event.preventDefault();
              void updateLocale(item.value);
            }}
          >
            {labels.localeSwitch[item.labelKey]}
            {locale === item.value ? <Check aria-hidden="true" className="ml-auto size-4" /> : null}
          </DropdownMenuItem>
        ))}
        {accessLockEnabled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={isLocking}
              onSelect={(event) => {
                event.preventDefault();
                void lockVault();
              }}
            >
              <LockKeyhole aria-hidden="true" className="mr-2 size-4" />
              {isLocking ? 'Locking…' : 'Lock vault'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
