'use client';

import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {
  bodyAreaLabel,
  exerciseCatalog,
  normalizeExerciseName,
  type CatalogEntry,
} from '@/lib/exercise-catalog';

/** Built-in exercises matching a typed name, leaving out the one already picked. */
export function catalogSuggestions(name: string, limit = 6): CatalogEntry[] {
  const key = normalizeExerciseName(name);
  return exerciseCatalog
    .search(name, {limit: limit + 1})
    .filter((entry) => normalizeExerciseName(entry.name) !== key)
    .slice(0, limit);
}

/** A built-in exercise in a suggestion list, with the areas it works. */
export function CatalogSuggestion({
  entry,
  onPick,
}: {
  entry: CatalogEntry;
  onPick: (entry: CatalogEntry) => void;
}) {
  return (
    <li
      onMouseDown={(event) => {
        event.preventDefault();
        onPick(entry);
      }}
      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1 truncate">
        {entry.name}
        <span className="ml-2 text-xs text-muted-foreground">
          {entry.areas.primary.map(bodyAreaLabel).join(', ')}
        </span>
      </span>
    </li>
  );
}

/**
 * An exercise name field suggesting built-in exercises, which come with an
 * animation. Any other name is still allowed for the user's own exercises.
 */
export function ExerciseNameInput({
  id,
  value,
  onChange,
  maxLength,
  required,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  maxLength?: number;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = open ? catalogSuggestions(value) : [];
  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        maxLength={maxLength}
        required={required}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul
          aria-label="Built-in exercises"
          className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border/50 bg-background shadow-lg"
        >
          {suggestions.map((entry) => (
            <CatalogSuggestion
              key={entry.id}
              entry={entry}
              onPick={(picked) => {
                onChange(picked.name);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
