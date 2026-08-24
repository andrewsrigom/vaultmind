'use client';

import { LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function LockVaultButton() {
  const router = useRouter();
  const [isLocking, setIsLocking] = useState(false);

  return (
    <Button
      disabled={isLocking}
      onClick={async () => {
        setIsLocking(true);

        try {
          await fetch('/api/access/unlock', { method: 'DELETE' });
          router.replace('/unlock');
          router.refresh();
        } finally {
          setIsLocking(false);
        }
      }}
      type="button"
      variant="outline"
    >
      <LockKeyhole aria-hidden="true" />
      {isLocking ? 'Locking…' : 'Lock now'}
    </Button>
  );
}
