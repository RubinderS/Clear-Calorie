'use client';

import {useId, useState, type ReactNode} from 'react';
import {Toggler} from '@/components/ui/toggler';

const VIEWS = [
  {value: 'entries', label: 'Entries'},
  {value: 'weekly', label: '7-day trend'},
] as const;

type View = (typeof VIEWS)[number]['value'];

/** Switches a measurement card between its entries and its weekly trend. */
export function MeasurementViews({
  title,
  entries,
  weekly,
}: {
  /** The card's title, for the switch's accessible name. */
  title: string;
  entries: ReactNode;
  weekly: ReactNode;
}) {
  const [view, setView] = useState<View>('entries');
  const name = useId();
  return (
    <div className="space-y-4">
      <Toggler
        name={name}
        label={`${title} view`}
        options={VIEWS}
        value={view}
        onChange={setView}
        className="h-9 w-full sm:w-64"
      />
      {view === 'entries' ? entries : weekly}
    </div>
  );
}
