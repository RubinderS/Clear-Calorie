'use client';

import * as React from 'react';
import Link from 'next/link';
import {cn} from '@/lib/utils';

export type TogglerOption<T extends string> = {value: T; label: string};

export type TogglerProps<T extends string> = {
  /** The radio group's name; unique per toggler on the page. */
  name: string;
  /** Accessible name for the group, e.g. "Set 1 type". */
  label: string;
  options: readonly TogglerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

const TRACK =
  'relative grid h-10 auto-cols-fr grid-flow-col rounded-xl border border-input bg-background/60 p-0.5 shadow-sm';

const OPTION =
  'flex w-full items-center justify-center rounded-[0.6rem] px-2.5 font-medium text-muted-foreground transition-colors duration-200 motion-reduce:transition-none';

/** The highlight behind the selected option. */
function Highlight({index, count}: {index: number; count: number}) {
  // Options are equal width, so the highlight moves a whole width per step.
  return (
    <span
      aria-hidden
      className="absolute inset-y-0.5 left-0.5 rounded-[0.6rem] bg-primary shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
      style={{
        width: `calc((100% - 0.25rem) / ${count})`,
        transform: `translateX(${Math.max(0, index) * 100}%)`,
      }}
    />
  );
}

/**
 * A segmented control: one choice out of a few, with a highlight that slides
 * to the selected option. Built on radios, so it works with the keyboard and
 * screen readers like any radio group.
 */
export function Toggler<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  className,
}: TogglerProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(TRACK, className)}>
      <Highlight
        index={options.findIndex((option) => option.value === value)}
        count={options.length}
      />
      {options.map((option) => (
        <label key={option.value} className="relative flex">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="peer absolute inset-0 z-10 cursor-pointer appearance-none opacity-0"
          />
          <span
            className={cn(
              OPTION,
              'text-xs peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export type TogglerNavItem = {href: string; label: string};

/**
 * The Toggler's look for navigation: each option is a link, and the current
 * one is marked with aria-current="page".
 */
export function TogglerNav({
  label,
  items,
  current,
  className,
}: {
  /** Accessible name for the nav, e.g. "Log type". */
  label: string;
  items: readonly TogglerNavItem[];
  /** The href of the current page. */
  current: string;
  className?: string;
}) {
  // Slide on click instead of waiting for the next page to load.
  const [pending, setPending] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(current);
  if (shown !== current) {
    setShown(current);
    setPending(null);
  }
  const active = pending ?? current;

  return (
    <nav aria-label={label} className={cn(TRACK, className)}>
      <Highlight
        index={items.findIndex((item) => item.href === active)}
        count={items.length}
      />
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? 'page' : undefined}
          onClick={() => setPending(item.href)}
          className={cn(
            OPTION,
            'relative px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item.href === active
              ? 'text-primary-foreground'
              : 'hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
