'use client';

import * as React from 'react';
import {useRouter} from 'next/navigation';
import {format, isToday} from 'date-fns';
import {AlertTriangle, Check, Dumbbell, Scale, Utensils} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatExerciseDetail, type ExerciseSet} from '@/lib/exercise';
import type {ChatActionStatus, ChatActionView} from '@/lib/chat/view';
import {cn} from '@/lib/utils';

const KIND = {
  food: {icon: Utensils, label: 'Log food'},
  exercise: {icon: Dumbbell, label: 'Log exercise'},
  weight: {icon: Scale, label: 'Log weight'},
} as const;

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

function Summary({action}: {action: ChatActionView}) {
  const entry = action.entry;
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

/** A log entry the coach proposed, with Confirm and Dismiss. */
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
  const {icon: Icon, label} = KIND[action.kind] ?? KIND.food;

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
              {busy === 'confirm' ? 'Logging…' : 'Confirm'}
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
            <Check aria-hidden className="size-4" /> Logged
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Dismissed</p>
        )}
      </div>
    </div>
  );
}
