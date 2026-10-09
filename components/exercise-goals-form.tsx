'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {ExerciseGoal} from '@prisma/client';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
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
import {cn} from '@/lib/utils';
import {
  WEEKDAYS,
  isActiveOn,
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [details, setDetails] = useState(EMPTY_EXERCISE_DETAILS);
  const [days, setDays] = useState<number[]>([]);
  const [estimating, setEstimating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAssumptions, setAiAssumptions] = useState<string | null>(null);

  const allCollapsed = collapsedDays.length === WEEKDAYS.length;

  function toggleCollapsed(day: number) {
    setCollapsedDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    );
  }

  const allDaysSelected = days.length === WEEKDAYS.length;
  const someDaysSelected = days.length > 0 && !allDaysSelected;

  function closeDialog() {
    setDialogOpen(false);
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
    setDialogOpen(true);
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
    // A goal can be listed under several days; deleting removes it from all.
    const message =
      maskToDays(goal.daysMask).length > 1
        ? `Delete "${goal.name}" from all its days?`
        : `Delete "${goal.name}"?`;
    if (!window.confirm(message)) return;

    const response = await fetch(`/api/exercise-goals?id=${goal.id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
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

    closeDialog();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Weekly schedule</CardTitle>
          <CardDescription>
            Save the exercises you plan to do on each day of the week, then tick
            them off on the exercise page
          </CardDescription>
        </div>
        <Button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="shrink-0"
        >
          <Plus aria-hidden="true" />
          Add exercise
        </Button>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exercise plan yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCollapsedDays(
                    allCollapsed ? [] : WEEKDAYS.map(({day}) => day),
                  )
                }
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            </div>
            {WEEKDAYS.map(({day, name}) => {
              const dayGoals = goals.filter((goal) =>
                isActiveOn(goal.daysMask, day),
              );
              const collapsed = collapsedDays.includes(day);
              return (
                <section key={day}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      aria-controls={`exerciseGoalsDay-${day}`}
                      onClick={() => toggleCollapsed(day)}
                      className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0 transition-transform',
                          collapsed && '-rotate-90',
                        )}
                      />
                      {name}
                      {collapsed && (
                        <span className="ml-auto font-normal">
                          {dayGoals.length === 0
                            ? 'Rest day'
                            : `${dayGoals.length} ${dayGoals.length === 1 ? 'exercise' : 'exercises'}`}
                        </span>
                      )}
                    </button>
                  </h3>
                  <div
                    id={`exerciseGoalsDay-${day}`}
                    hidden={collapsed}
                    className="mt-2"
                  >
                    {dayGoals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Rest day</p>
                    ) : (
                      <ul className="space-y-3">
                        {dayGoals.map((goal) => (
                          <li
                            key={goal.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 p-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {goal.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatExerciseDetail(goal)}
                                {goal.calories > 0 &&
                                  ` · ${goal.calories} kcal`}
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
                </section>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        label={editingId ? 'Edit exercise' : 'Add exercise'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="pr-8">
            <h2 className="text-lg font-semibold">
              {editingId ? 'Edit exercise' : 'Add exercise'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose the exercise and the days you plan to do it.
            </p>
          </div>
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
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading
                ? 'Saving...'
                : editingId
                  ? 'Update exercise'
                  : 'Add exercise'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
