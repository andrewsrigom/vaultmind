import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import Script from 'next/script';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './globals.css';

export const metadata: Metadata = {
  description: 'A private knowledge workspace for source-grounded internal answers.',
  icons: {
    icon: '/icon.svg',
  },
  title: 'VaultMind',
};

const themeBootScript = `
(function() {
  try {
    var storedTheme = window.localStorage.getItem('vaultmind-theme');
    var theme = storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
          id="theme-boot"
          strategy="beforeInteractive"
        />
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
