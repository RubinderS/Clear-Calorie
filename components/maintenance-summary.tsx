'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {ProfileSummary} from '@/lib/profile';
import {ADAPTIVE_MIN_DAYS, BMR_FORMULA_LABELS} from '@/lib/tdee';

interface MaintenanceSummaryProps {
  summary: ProfileSummary;
  /** The current food goal, to offer the suggested targets when they differ. */
  foodGoal: {calories: number; protein: number};
}

const kcal = (value: number) => `${value.toLocaleString('en-AU')} kcal`;

export function MaintenanceSummary({summary, foodGoal}: MaintenanceSummaryProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {maintenance, targets} = summary;
  const matchesFoodGoal =
    foodGoal.calories === targets.calories &&
    foodGoal.protein === targets.protein;

  async function applyTargets() {
    setSaving(true);
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        calorieGoal: targets.calories,
        proteinGoal: targets.protein,
      }),
    });
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Calories to maintain your weight ·{' '}
          {maintenance.isEstimate ? 'estimate' : 'from your logs'}
        </CardDescription>
        <CardTitle className="text-3xl tabular-nums" data-testid="maintenance">
          {kcal(maintenance.maintenance)}
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            / day
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          {maintenance.adaptive && (
            <div className="rounded-xl border border-border/50 p-3">
              <dt className="text-xs text-muted-foreground">
                Based on your logs
              </dt>
              <dd className="font-semibold tabular-nums">
                {kcal(maintenance.adaptive.tdee)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                Over {maintenance.adaptive.days} days you ate{' '}
                {kcal(maintenance.adaptive.avgIntake)} a day and your weight
                changed {maintenance.adaptive.weightChangeKg > 0 ? '+' : ''}
                {maintenance.adaptive.weightChangeKg} kg
              </dd>
            </div>
          )}
          <div className="rounded-xl border border-border/50 p-3">
            <dt className="text-xs text-muted-foreground">
              Based on your details
            </dt>
            <dd className="font-semibold tabular-nums">
              {kcal(maintenance.formulaTdee)}
            </dd>
            <dd className="text-xs text-muted-foreground">
              Calories at rest, adjusted for your lifestyle
            </dd>
          </div>
          <div className="rounded-xl border border-border/50 p-3">
            <dt className="text-xs text-muted-foreground">Calories at rest</dt>
            <dd className="font-semibold tabular-nums">
              {kcal(maintenance.bmr)}
            </dd>
            <dd className="text-xs text-muted-foreground">
              What your body burns doing nothing (BMR,{' '}
              {BMR_FORMULA_LABELS[maintenance.bmrFormula]})
            </dd>
          </div>
        </dl>

        {maintenance.adaptive &&
          maintenance.adaptive.tdee < maintenance.bmr && (
            <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
              Your logs show less than your calories at rest, which usually
              means some food isn&apos;t being logged. Log everything you eat
              for a more accurate figure.
            </p>
          )}

        {maintenance.isEstimate && (
          <p className="text-xs text-muted-foreground">
            This is an estimate from your details. Log your weight and food on
            the same days for {ADAPTIVE_MIN_DAYS} days in four weeks (
            {maintenance.loggedDays} so far) to get a figure from your own
            data.
          </p>
        )}

        <div className="space-y-3 rounded-xl bg-primary/5 p-3">
          <p>
            <span className="font-medium">{summary.goalLabel}:</span> aim for{' '}
            <span className="font-semibold tabular-nums">
              {kcal(targets.calories)}
            </span>{' '}
            and{' '}
            <span className="font-semibold tabular-nums">
              {targets.protein} g protein
            </span>{' '}
            a day.
          </p>
          {matchesFoodGoal ? (
            <p className="text-xs text-muted-foreground">
              Your food goal already matches.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Your food goal is {kcal(foodGoal.calories)} and{' '}
                {foodGoal.protein} g protein.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={applyTargets}
              >
                {saving ? 'Saving...' : 'Use for food goal'}
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Estimates for healthy adults, not medical advice.
        </p>
      </CardContent>
    </Card>
  );
}
