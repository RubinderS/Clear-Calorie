'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {
  ChevronDown,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type {ExerciseGoal} from '@/lib/data/types';
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
  withDefaultMode,
} from '@/components/exercise-detail-fields';
import {ExerciseAreaTag, ExerciseAreas, ExerciseHowTo} from '@/components/exercise-animation';
import {ExerciseNameInput} from '@/components/exercise-name-input';
import {
  SequenceStepsField,
  SequenceTag,
  toStepDrafts,
  toStepsPayload,
  type StepDraft,
} from '@/components/sequence-steps-field';
import {dayFocus} from '@/lib/day-focus';
import {catalogIdFor, exerciseCatalog} from '@/lib/exercise-catalog';
import {cn} from '@/lib/utils';
import {
  EXERCISE_NOTES_MAX,
  SEQUENCE_TYPE,
  WEEKDAYS,
  describeSequence,
  goalCatalogIds,
  isActiveOn,
  isSequence,
  formatExerciseDetail,
  maskToDays,
  parseSequenceSteps,
} from '@/lib/exercise';

type ExerciseGoalsFormProps = {
  goals: ExerciseGoal[];
};

export function ExerciseGoalsForm({goals}: ExerciseGoalsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A sequence is several exercises done back to back and ticked off as one.
  const [kind, setKind] = useState<'exercise' | 'sequence'>('exercise');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [name, setName] = useState('');
  // The built-in exercise this name links to, if any.
  const builtIn =
    kind === 'exercise' ? exerciseCatalog.get(catalogIdFor(name)) : undefined;
  const sequence = kind === 'sequence';
  const noun = sequence ? 'sequence' : 'exercise';
  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState(EMPTY_EXERCISE_DETAILS);
  const [days, setDays] = useState<number[]>([]);

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

  function openDialog(next: 'exercise' | 'sequence') {
    setKind(next);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setKind('exercise');
    setSteps([]);
    setName('');
    setNotes('');
    setDetails(EMPTY_EXERCISE_DETAILS);
    setDays([]);
    setError(null);
  }

  function startEdit(goal: ExerciseGoal) {
    setDialogOpen(true);
    setEditingId(goal.id);
    setKind(isSequence(goal) ? 'sequence' : 'exercise');
    setSteps(toStepDrafts(parseSequenceSteps(goal.steps) ?? []));
    setName(goal.name);
    setNotes(goal.notes ?? '');
    setDetails(toDetailValues(goal));
    setDays(maskToDays(goal.daysMask));
    setError(null);
  }

  function changeName(next: string) {
    setName(next);
    // A built-in exercise sets its sets for reps or a time, as it's done.
    setDetails((current) =>
      withDefaultMode(current, exerciseCatalog.get(catalogIdFor(next))),
    );
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

    if (sequence && steps.length === 0) {
      setError('Add at least one exercise to the sequence.');
      return;
    }
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
        notes,
        days,
        ...(sequence
          ? {type: SEQUENCE_TYPE, steps: toStepsPayload(steps)}
          : toDetailsPayload(details)),
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? `Failed to save ${noun}`);
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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => openDialog('sequence')}
            className="flex-1 sm:flex-none"
          >
            <ListOrdered aria-hidden="true" />
            Add sequence
          </Button>
          <Button
            type="button"
            onClick={() => openDialog('exercise')}
            className="flex-1 sm:flex-none"
          >
            <Plus aria-hidden="true" />
            Add exercise
          </Button>
        </div>
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
              const focus = dayFocus(dayGoals.map(goalCatalogIds));
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
                      {focus && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {focus}
                        </span>
                      )}
                      {/* An open rest day already says so below. */}
                      {(collapsed || dayGoals.length > 0) && (
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
                              <p className="flex min-w-0 items-baseline gap-2">
                                <span className="truncate font-medium">
                                  {goal.name}
                                </span>
                                {isSequence(goal) ? (
                                  <SequenceTag />
                                ) : (
                                  <ExerciseAreaTag catalogId={goal.catalogId} />
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatExerciseDetail(goal)}
                              </p>
                              {isSequence(goal) && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {describeSequence(
                                    parseSequenceSteps(goal.steps) ?? [],
                                  ).join(' · ')}
                                </p>
                              )}
                              {goal.notes && (
                                <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                                  {goal.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center">
                              <ExerciseHowTo catalogId={goal.catalogId} />
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
        label={`${editingId ? 'Edit' : 'Add'} ${noun}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="pr-8">
            <h2 className="text-lg font-semibold">
              {editingId ? 'Edit' : 'Add'} {noun}
            </h2>
            <p className="text-sm text-muted-foreground">
              {sequence
                ? 'Exercises done back to back, with a break between each. Started and ticked off as one.'
                : 'Choose the exercise and the days you plan to do it.'}
            </p>
          </div>
          {sequence ? (
            <>
              <div className="flex flex-col space-y-2">
                <Label htmlFor="exerciseGoalName">Name</Label>
                <Input
                  id="exerciseGoalName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Cardio circuit"
                  maxLength={100}
                  required
                />
              </div>
              <SequenceStepsField
                idPrefix="exerciseGoalSequence"
                value={steps}
                onChange={setSteps}
              />
            </>
          ) : (
            <>
              <div className="flex flex-col space-y-2">
                {/* Built-in exercises show how they're done and what they work while choosing one. */}
                <div className="flex min-h-8 items-center justify-between gap-2">
                  <Label htmlFor="exerciseGoalName">Exercise</Label>
                  <ExerciseHowTo
                    catalogId={catalogIdFor(name)}
                    className="-my-1"
                  />
                </div>
                <ExerciseNameInput
                  id="exerciseGoalName"
                  value={name}
                  onChange={changeName}
                  maxLength={100}
                  required
                />
                {builtIn && <ExerciseAreas entry={builtIn} />}
              </div>
              <ExerciseDetailFields
                idPrefix="exerciseGoal"
                value={details}
                onChange={setDetails}
              />
            </>
          )}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="exerciseGoalNotes">
              Notes{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <textarea
              id="exerciseGoalNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={EXERCISE_NOTES_MAX}
              rows={3}
              placeholder="e.g. Seat height 4, keep elbows tucked"
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
            />
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
            <div className="grid grid-cols-4 gap-x-2 gap-y-2 sm:grid-cols-7">
              {WEEKDAYS.map(({day, label}) => (
                <div key={day} className="flex items-center gap-1.5">
                  <input
                    id={`exerciseGoalDay-${day}`}
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={(event) => toggleDay(day, event.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-input accent-primary"
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
                : `${editingId ? 'Update' : 'Add'} ${noun}`}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
