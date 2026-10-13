'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {buttonVariants} from '@/components/ui/button';
import {cn} from '@/lib/utils';

export type ReportWeekOption = {weekStart: string; label: string};

interface ReportWeekPickerProps {
  /** Newest first. */
  weeks: ReportWeekOption[];
  selected: string;
}

const weekHref = (weekStart: string) => `/reports?week=${weekStart}`;

/** Previous / next report links around a dropdown of every report week. */
export function ReportWeekPicker({weeks, selected}: ReportWeekPickerProps) {
  const router = useRouter();
  const index = weeks.findIndex((week) => week.weekStart === selected);
  const older = weeks[index + 1];
  const newer = index > 0 ? weeks[index - 1] : undefined;

  return (
    <nav aria-label="Report weeks" className="flex items-center gap-2">
      <StepLink week={older} label="Previous week">
        <ChevronLeft aria-hidden />
        <span className="hidden sm:inline">Previous</span>
      </StepLink>
      {/* The native arrow ignores padding, so it's hidden and drawn here instead. */}
      <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
        <select
          aria-label="Report week"
          value={selected}
          onChange={(event) => router.push(weekHref(event.target.value))}
          className="h-10 w-full appearance-none truncate rounded-xl border border-input bg-background pl-4 pr-10 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {weeks.map((week, i) => (
            <option key={week.weekStart} value={week.weekStart}>
              {i === 0 ? `${week.label} (latest)` : week.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <StepLink week={newer} label="Next week">
        <span className="hidden sm:inline">Next</span>
        <ChevronRight aria-hidden />
      </StepLink>
    </nav>
  );
}

function StepLink({
  week,
  label,
  children,
}: {
  week: ReportWeekOption | undefined;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(
    buttonVariants({variant: 'outline'}),
    'px-3 sm:px-4',
    !week && 'pointer-events-none opacity-50',
  );
  if (!week) {
    return (
      <span aria-disabled="true" aria-label={label} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link href={weekHref(week.weekStart)} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
