'use client';

import * as React from 'react';

const mobileBreakpoint = 768;

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);

  mediaQuery.addEventListener('change', callback);

  return () => mediaQuery.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
