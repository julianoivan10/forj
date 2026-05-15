'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CommandPalette } from './command-palette';

/**
 * Provider that hosts the global command palette + global hotkey
 * listener. Mounted once near the root so the open state survives
 * route changes and any UI surface can call `useCommandPalette().open()`.
 *
 * Hotkey: cmd+k (mac) / ctrl+k (everyone else). We deliberately don't
 * bind `/` (Twitter-style) because that conflicts with text inputs.
 */

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const closeFn = useCallback(() => setOpen(false), []);
  const openFn = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isCmdK) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider
      value={{ open: openFn, close: closeFn, toggle }}
    >
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within <CommandPaletteProvider>');
  }
  return ctx;
}
