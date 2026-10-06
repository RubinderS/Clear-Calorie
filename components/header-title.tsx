'use client';

import {usePathname} from 'next/navigation';

interface HeaderTitleProps {
  items: {href: string; label: string}[];
}

export function HeaderTitle({items}: HeaderTitleProps) {
  const pathname = usePathname();
  const current = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <>
      <span className="truncate md:hidden">
        {current?.label ?? 'Clear Calorie'}
      </span>
      <span className="hidden md:inline">Clear Calorie</span>
    </>
  );
}
