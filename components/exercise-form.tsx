'use client';

import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  EMPTY_EXERCISE_DETAILS,
  ExerciseDetailFields,
  toDetailValues,
  toDetailsPayload,
} from '@/components/exercise-detail-fields';
import {Decimal} from '@/lib/decimal';
import {formatExerciseDetail, isSameExerciseName} from '@/lib/exercise';

type SavedExerciseItem = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  isPinned: boolean;
};

const MAX_SUGGESTIONS = 8;
const NO_PLANNED_NAMES: string[] = [];

type ExerciseFormProps = {
  plannedNames?: string[];
  onLogCreated?: () => void;
  /** Shown under the title, e.g. a link to past logs. */
  headerAction?: React.ReactNode;
};

export function ExerciseForm({
  plannedNames = NO_PLANNED_NAMES,
  onLogCreated,
  headerAction,
}: ExerciseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [savedExercises, setSavedExercises] = useState<SavedExerciseItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [details, setDetails] = useState(EMPTY_EXERCISE_DETAILS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetch('/api/saved-exercise')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSavedExercises(data);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });
  }, []);

  const suggestions = useMemo(() => {
    const query = name.trim().toLowerCase();
    const available = savedExercises.filter(
      (item) =>
        !plannedNames.some((planned) => isSameExerciseName(planned, item.name)),
    );
    const pool = query
      ? available.filter((item) => item.name.toLowerCase().includes(query))
      : available.filter((item) => item.isPinned);

    return [...pool]
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [name, savedExercises, plannedNames]);

  function applySuggestion(item: SavedExerciseItem) {
    const form = document.getElementById(
      'exercise-form',
    ) as HTMLFormElement | null;
    if (!form) return;

    (form.elements.namedItem('calories') as HTMLInputElement).value = String(
      item.calories,
    );

    setName(item.name);
    setDetails(toDetailValues(item));
    setSelectedId(item.id);
    setIsSaved(true);
    setIsPinned(item.isPinned);
    setShowSuggestions(false);
    setSaveError(null);
  }

  async function deleteSavedExercise(
    item: SavedExerciseItem,
    event: React.MouseEvent,
  ) {
    event.stopPropagation();
    event.preventDefault();
    if (
      !window.confirm(
        `Delete saved exercise "${item.name}"? This cannot be undone. Existing exercise logs will not be affected.`,
      )
    ) {
      return;
    }

    const {id} = item;
    const response = await fetch(`/api/saved-exercise?id=${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setSavedExercises((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
    }
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value);
    setSelectedId(null);
    setShowSuggestions(true);
    setSaveError(null);
  }

  function handleSaveChange(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setIsSaved(checked);
    if (!checked) {
      setIsPinned(false);
    }
    setSaveError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const data = {
      name: (formData.get('name') as string)?.trim(),
      calories: new Decimal(Number(formData.get('calories')))
        .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
        .toNumber(),
      ...toDetailsPayload(details),
    };

    if (
      plannedNames.some((planned) => isSameExerciseName(planned, data.name))
    ) {
      setSaveError(
        `"${data.name}" is in today's plan. Tick it off there instead.`,
      );
      return;
    }

    setSaveError(null);
    setLoading(true);

    if (isSaved) {
      const saveResponse = await fetch('/api/saved-exercise', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: selectedId ?? undefined,
          ...data,
          isPinned,
        }),
      });

      if (!saveResponse.ok) {
        const payload = await saveResponse.json().catch(() => null);
        setSaveError(payload?.error ?? 'Failed to save exercise item');
        setLoading(false);
        return;
      }

      const updated = await saveResponse.json();
      setSavedExercises((prev) => {
        const exists = prev.find((item) => item.id === updated.id);
        if (exists) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedId(updated.id);
    }

    const response = await fetch('/api/exercise', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (response.ok) {
      (event.target as HTMLFormElement)?.reset();
      setName('');
      setDetails(EMPTY_EXERCISE_DETAILS);
      setSelectedId(null);
      setIsSaved(false);
      setIsPinned(false);
      onLogCreated?.();
      router.refresh();
    } else {
      const payload = await response.json().catch(() => null);
      setSaveError(payload?.error ?? 'Failed to log exercise');
    }
  }

  return (
    <Card>
      <CardHeader className="pr-14">
        <CardTitle>Add custom exercise</CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        <form id="exercise-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="relative flex flex-col space-y-2">
            <Label htmlFor="name">Activity</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={handleNameChange}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoComplete="off"
              required
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border/50 bg-background shadow-lg">
                {suggestions.map((item) => (
                  <li
                    key={item.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySuggestion(item);
                    }}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.isPinned && '📌 '}
                      {item.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatExerciseDetail(item)} · {item.calories} kcal
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onMouseDown={(event) => deleteSavedExercise(item, event)}
                      className="shrink-0 rounded px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ExerciseDetailFields
            idPrefix="exercise"
            value={details}
            onChange={setDetails}
          />
          <div className="flex flex-col space-y-2">
            <Label htmlFor="calories">Calories burned</Label>
            <Input
              id="calories"
              name="calories"
              type="number"
              min={0}
              required
            />
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <input
                id="isSaved"
                type="checkbox"
                checked={isSaved}
                onChange={handleSaveChange}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor="isSaved" className="cursor-pointer font-normal">
                Save this item for later
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="isPinned"
                type="checkbox"
                checked={isPinned}
                disabled={!isSaved}
                onChange={(event) => setIsPinned(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Label
                htmlFor="isPinned"
                className="cursor-pointer font-normal peer-disabled:opacity-50"
              >
                Pin this item
              </Label>
            </div>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-red-500">
              {saveError}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Log exercise'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
