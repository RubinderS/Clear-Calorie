'use client';

import {useEffect, useRef} from 'react';
import {X} from 'lucide-react';
import {cn} from '@/lib/utils';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Extra classes, e.g. a wider max-width. */
  className?: string;
  children: React.ReactNode;
};

export function Dialog({
  open,
  onClose,
  label,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the close button, which iOS paints with a focus ring.
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-background p-0 text-foreground shadow-xl outline-none backdrop:bg-black/50 backdrop:backdrop-blur-sm',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 z-20 rounded-lg p-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      {open && children}
    </dialog>
  );
}
