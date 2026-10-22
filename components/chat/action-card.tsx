'use client';

import * as React from 'react';
import {useRouter} from 'next/navigation';
import {format, isToday} from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  Dumbbell,
  Link2,
  Scale,
  Utensils,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatExerciseDetail, type ExerciseSet} from '@/lib/exercise';
import {
  catalogLinksSchema,
  planChangeRows,
  planChangeSchema,
  type StoredPlanChange,
} from '@/lib/chat/plan-change';
import type {ChatActionStatus, ChatActionView} from '@/lib/chat/view';
import {cn} from '@/lib/utils';

const KIND = {
  food: {icon: Utensils, label: 'Log food'},
  exercise: {icon: Dumbbell, label: 'Log exercise'},
  weight: {icon: Scale, label: 'Log weight'},
  plan: {icon: CalendarDays, label: 'Change plan'},
  links: {icon: Link2, label: 'Match to built-in exercises'},
} as const;

const PLAN_LABEL = {
  add: 'Add to plan',
  update: 'Change plan',
  remove: 'Remove from plan',
} as const;

function planChangeOf(action: ChatActionView): StoredPlanChange | null {
  if (action.kind !== 'plan') return null;
  const parsed = planChangeSchema.safeParse(action.entry);
  return parsed.success ? parsed.data : null;
}

function PlanSummary({change}: {change: StoredPlanChange}) {
  const name = (change.operation === 'remove' ? change.before : change.goal).name;
  return (
    <>
      <p className="font-medium">{name}</p>
      <dl className="mt-1 space-y-0.5 text-sm">
        {planChangeRows(change).map((row) =>
          row.lines ? (
            <div key={row.label}>
              <dt className="text-muted-foreground">
                {row.label}
                {row.before !== undefined && ' (changed)'}:
              </dt>
              <dd>
                <ul className="mt-0.5 space-y-0.5 border-l-2 pl-2">
                  {row.lines.map((line, index) => (
                    <li
                      key={index}
                      className={cn(
                        line.startsWith('Break') && 'text-muted-foreground',
                      )}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline gap-x-1.5"
            >
              <dt className="text-muted-foreground">{row.label}:</dt>
              <dd className="flex flex-wrap items-baseline gap-x-1.5">
                {row.before !== undefined && (
                  <>
                    <span className="text-muted-foreground line-through">
                      {row.before}
                    </span>
                    <ArrowRight
                      aria-label="to"
                      className="size-3.5 self-center"
                    />
                  </>
                )}
                <span
                  className={cn(
                    change.operation === 'remove' && 'text-muted-foreground',
                  )}
                >
                  {row.after}
                </span>
              </dd>
            </div>
          ),
        )}
      </dl>
      {change.operation === 'remove' && (
        <p className="mt-2 text-sm text-muted-foreground">
          Removed from your plan from today on. Past days keep it.
        </p>
      )}
    </>
  );
}

function LinksSummary({action}: {action: ChatActionView}) {
  const parsed = catalogLinksSchema.safeParse(action.entry);
  if (!parsed.success) {
    return <p className="text-sm text-muted-foreground">These changes can&apos;t be shown.</p>;
  }
  return (
    <>
      <ul className="space-y-0.5 text-sm">
        {parsed.data.links.map((link) => (
          <li key={link.goalId} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-muted-foreground line-through">{link.before}</span>
            <ArrowRight aria-label="to" className="size-3.5 self-center" />
            <span className="font-medium">{link.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">
        Renamed in your plan to show how-to animations. Sets and days stay the same.
      </p>
    </>
  );
}

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

function Summary({action}: {action: ChatActionView}) {
  const entry = action.entry;
  if (action.kind === 'plan') {
    const change = planChangeOf(action);
    return change ? (
      <PlanSummary change={change} />
    ) : (
      <p className="text-sm text-muted-foreground">This plan change can&apos;t be shown.</p>
    );
  }
  if (action.kind === 'links') return <LinksSummary action={action} />;
  if (action.kind === 'food') {
    const alert = entry.healthAlert as {level: string; message: string} | null | undefined;
    return (
      <>
        <p className="font-medium">{String(entry.name ?? '')}</p>
        <p className="text-sm text-muted-foreground">
          {Math.round(num(entry.calories))} kcal · P {num(entry.protein)}g · C {num(entry.carbs)}g · F{' '}
          {num(entry.fat)}g (sat {num(entry.saturatedFat)}g)
        </p>
        {alert?.message && (
          <p
            className={cn(
              'mt-2 flex items-start gap-1.5 text-sm',
              alert.level === 'avoid' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {alert.message}
          </p>
        )}
      </>
    );
  }
  if (action.kind === 'exercise') {
    const detail = formatExerciseDetail({
      type: String(entry.type ?? 'TIME'),
      durationMin: entry.durationMin as number | undefined,
      sets: entry.sets as number | undefined,
      reps: entry.reps as number | undefined,
      weight: entry.weight as number | undefined,
      exerciseSets: entry.exerciseSets as ExerciseSet[] | undefined,
    });
    return (
      <>
        <p className="font-medium">{String(entry.name ?? '')}</p>
        <p className="text-sm text-muted-foreground">
          {detail}
          {entry.weight ? ' kg' : ''} · {num(entry.calories)} kcal
        </p>
      </>
    );
  }
  return <p className="font-medium">{num(entry.weight)} kg</p>;
}

/** A log entry or plan change the coach proposed, with Confirm and Dismiss. */
export function ActionCard({
  action,
  onStatusChange,
}: {
  action: ChatActionView;
  onStatusChange: (id: string, status: ChatActionStatus) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'confirm' | 'dismiss' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const {icon: Icon, label: kindLabel} = KIND[action.kind] ?? KIND.food;
  const planChange = planChangeOf(action);
  const label = planChange
    ? planChange.operation === 'add' && 'steps' in planChange.goal
      ? 'Add sequence to plan'
      : PLAN_LABEL[planChange.operation]
    : kindLabel;
  const isPlan = action.kind === 'plan' || action.kind === 'links';

  async function decide(decision: 'confirm' | 'dismiss') {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/chat/actions/${action.id}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({decision}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      onStatusChange(action.id, data.status);
      // Show the new entry on the page behind the chat.
      if (data.status === 'confirmed') router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-sm',
        action.status === 'dismissed' && 'opacity-60',
      )}
      data-testid="chat-action"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden className="size-4" />
        {label}
        <span className="font-normal normal-case tracking-normal">
          · {isToday(new Date(action.createdAt)) ? 'today' : format(new Date(action.createdAt), 'EEE d MMM')}
        </span>
      </div>
      <Summary action={action} />
      {action.note && (
        <p className="mt-2 text-xs text-muted-foreground">{action.note}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3">
        {action.status === 'pending' ? (
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={busy !== null}
              onClick={() => decide('confirm')}
            >
              {busy === 'confirm' ? (isPlan ? 'Saving…' : 'Logging…') : 'Confirm'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={busy !== null}
              onClick={() => decide('dismiss')}
            >
              Dismiss
            </Button>
          </div>
        ) : action.status === 'confirmed' ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check aria-hidden className="size-4" /> {isPlan ? 'Plan updated' : 'Logged'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Dismissed</p>
        )}
      </div>
    </div>
  );
}
