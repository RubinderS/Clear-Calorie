'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {TIMEZONE_COOKIE} from '@/lib/timezone-constants';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

/** Keeps a `tz` cookie in sync with the browser's IANA timezone so Server Components can read it. */
export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || readCookie(TIMEZONE_COOKIE) === detected) return;

    document.cookie = `${TIMEZONE_COOKIE}=${detected}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
