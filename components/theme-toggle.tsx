'use client';

import * as React from 'react';
import {Moon, Sun, SunMoon} from 'lucide-react';
import {useTheme, type Theme} from '@/components/theme-provider';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';

const OPTIONS: {value: Theme; label: string; icon: typeof Sun}[] = [
  {value: 'light', label: 'Light', icon: Sun},
  {value: 'dark', label: 'Dark', icon: Moon},
  {value: 'system', label: 'System', icon: SunMoon},
];

export function ThemeToggle() {
  const {theme, setTheme} = useTheme();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const ActiveIcon = OPTIONS.find((o) => o.value === theme)?.icon ?? SunMoon;

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ActiveIcon className="size-5" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {OPTIONS.map(({value, label, icon: Icon}) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors',
                theme === value
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
