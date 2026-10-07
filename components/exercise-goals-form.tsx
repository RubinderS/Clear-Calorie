'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Loader2, Pencil, Sparkles, Trash2} from 'lucide-react';
import type {ExerciseGoal} from '@prisma/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EMPTY_EXERCISE_DETAILS,
  ExerciseDetailFields,
  toDetailValues,
  toDetailsPayload,
} from '@/components/exercise-detail-fields';
import {Decimal} from '@/lib/decimal';
import {
  WEEKDAYS,
  formatDays,
  formatExerciseDetail,
  maskToDays,
} from '@/lib/exercise';

type ExerciseGoalsFormProps = {
  goals: ExerciseGoal[];
  aiEnabled?: boolean;
};

function optionalNumber(value: string) {
  return Number(value) > 0 ? Number(value) : null;
}

export function ExerciseGoalsForm({goals, aiEnabled}: ExerciseGoalsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [details, setDetails] = useState(EMPTY_EXERCISE_DETAILS);
  const [days, setDays] = useState<number[]>([]);
  const [estimating, setEstimating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAssumptions, setAiAssumptions] = useState<string | null>(null);

  const allDaysSelected = days.length === WEEKDAYS.length;
  const someDaysSelected = days.length > 0 && !allDaysSelected;

  function resetForm() {
    setEditingId(null);
    setName('');
    setCalories('');
    setDetails(EMPTY_EXERCISE_DETAILS);
    setDays([]);
    setError(null);
    setAiError(null);
    setAiAssumptions(null);
  }

  function startEdit(goal: ExerciseGoal) {
    setEditingId(goal.id);
    setName(goal.name);
    setCalories(goal.calories > 0 ? String(goal.calories) : '');
    setDetails(toDetailValues(goal));
    setDays(maskToDays(goal.daysMask));
    setError(null);
    setAiError(null);
    setAiAssumptions(null);
  }

  async function estimateWithAi() {
    const exerciseName = name.trim();
    if (!exerciseName) return;

    setEstimating(true);
    setAiError(null);

    try {
      const response = await fetch('/api/exercise/estimate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: exerciseName,
          type: details.type,
          ...(details.type === 'STRENGTH'
            ? {
                sets: optionalNumber(details.sets),
                reps: optionalNumber(details.reps),
                weight: optionalNumber(details.weight),
              }
            : {durationMin: optionalNumber(details.durationMin)}),
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setAiError(payload?.error ?? 'Could not estimate this exercise');
        return;
      }

      setCalories(String(payload.calories));
      setAiAssumptions(payload.assumptions || '');
    } catch {
      setAiError('Could not reach the AI service');
    } finally {
      setEstimating(false);
    }
  }

  function toggleDay(day: number, checked: boolean) {
    setDays((current) =>
      checked ? [...current, day] : current.filter((d) => d !== day),
    );
  }

  async function handleDelete(goal: ExerciseGoal) {
    if (!window.confirm(`Delete goal "${goal.name}"?`)) return;

    const response = await fetch(`/api/exercise-goals?id=${goal.id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      if (editingId === goal.id) resetForm();
      router.refresh();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (days.length === 0) {
      setError('Select at least one day.');
      return;
    }
    setError(null);
    setLoading(true);

    const response = await fetch('/api/exercise-goals', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        id: editingId ?? undefined,
        name: name.trim(),
        calories: calories.trim()
          ? new Decimal(Number(calories))
              .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
              .toNumber()
          : 0,
        days,
        ...toDetailsPayload(details),
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? 'Failed to save exercise goal');
      return;
    }

    resetForm();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise goals</CardTitle>
        <CardDescription>
          Save the exercises you plan to do on each day of the week, then tick
          them off on the exercise page
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exercise goals yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {goals.map((goal) => (
                <li
                  key={goal.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{goal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatExerciseDetail(goal)} ·{' '}
                      {goal.calories > 0 && `${goal.calories} kcal · `}
                      {formatDays(goal.daysMask)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${goal.name}`}
                      title={`Edit ${goal.name}`}
                      onClick={() => startEdit(goal)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${goal.name}`}
                      title={`Delete ${goal.name}`}
                      onClick={() => void handleDelete(goal)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/30 dark:hover:text-red-200"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="exerciseGoalName">Exercise</Label>
            <Input
              id="exerciseGoalName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <ExerciseDetailFields
            idPrefix="exerciseGoal"
            value={details}
            onChange={setDetails}
          />
          <div className="flex flex-col space-y-2">
            <Label htmlFor="exerciseGoalCalories">
              Calories burned{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="exerciseGoalCalories"
                type="number"
                min={0}
                value={calories}
                onChange={(event) => {
                  setCalories(event.target.value);
                  setAiAssumptions(null);
                }}
                className="min-w-0 flex-1"
              />
              {aiEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={estimateWithAi}
                  disabled={estimating || !name.trim()}
                  aria-label="Estimate calories burned with AI"
                  className="shrink-0 px-3"
                >
                  {estimating ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {estimating ? 'Estimating...' : 'Estimate'}
                </Button>
              )}
            </div>
            {aiError && (
              <p role="alert" className="text-sm text-red-500">
                {aiError}
              </p>
            )}
            {aiAssumptions !== null && (
              <p className="text-xs text-muted-foreground">
                <Sparkles className="mr-1 inline size-3" />
                AI estimate. Check before saving.
                {aiAssumptions && ` ${aiAssumptions}`}
              </p>
            )}
          </div>
          <fieldset className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
            <legend className="px-1 text-sm font-medium">Days</legend>
            <div className="flex items-center gap-2">
              <input
                id="exerciseGoalEveryday"
                type="checkbox"
                checked={allDaysSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someDaysSelected;
                }}
                onChange={(event) =>
                  setDays(
                    event.target.checked ? WEEKDAYS.map(({day}) => day) : [],
                  )
                }
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label
                htmlFor="exerciseGoalEveryday"
                className="cursor-pointer font-normal"
              >
                Every day
              </Label>
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-2 sm:grid-cols-7">
              {WEEKDAYS.map(({day, label}) => (
                <div key={day} className="flex items-center gap-2">
                  <input
                    id={`exerciseGoalDay-${day}`}
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(event) => toggleDay(day, event.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <Label
                    htmlFor={`exerciseGoalDay-${day}`}
                    className="cursor-pointer font-normal"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading} className="flex-1">
              {loading
                ? 'Saving...'
                : editingId
                  ? 'Update exercise goal'
                  : 'Add exercise goal'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
