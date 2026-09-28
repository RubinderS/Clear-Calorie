'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {cn} from '@/lib/utils';

interface DesktopNavProps {
  items: {href: string; label: string}[];
}

export function DesktopNav({items}: DesktopNavProps) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pathname === item.href
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
