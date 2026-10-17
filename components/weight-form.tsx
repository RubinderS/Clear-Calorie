'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {metricRange, metricStep, type TrackedMetric} from '@/lib/body-metrics';

type WeightFormProps = {
  onLogCreated?: () => void;
  /** Shown under the title, e.g. a link to past logs. */
  headerAction?: React.ReactNode;
  /** Body metrics the user tracks, each logged alongside weight. */
  metrics?: TrackedMetric[];
};

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

export function WeightForm({
  onLogCreated,
  headerAction,
  metrics = [],
}: WeightFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMetrics = metrics.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const value = (name: string) => {
      const raw = String(formData.get(name) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };

    const weight = value('weight');
    const entries = metrics.flatMap((metric) => {
      const metricValue = value(`metric-${metric.id}`);
      return metricValue === null ? [] : [{metricId: metric.id, value: metricValue}];
    });
    if (weight === null && entries.length === 0) {
      setError('Enter at least one measurement.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Measurements first: they're the ones more likely to be rejected, and
      // a failure then saves nothing.
      if (entries.length > 0) {
        const response = await fetch('/api/body-metrics/log', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({entries}),
        });
        if (!response.ok) {
          setError(await errorMessage(response, 'Failed to log measurements'));
          return;
        }
      }
      if (weight !== null) {
        const response = await fetch('/api/weight', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({weight}),
        });
        if (!response.ok) {
          setError(await errorMessage(response, 'Failed to log weight'));
          return;
        }
      }
      form.reset();
      onLogCreated?.();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pr-14">
        <CardTitle>{hasMetrics ? 'Log measurements' : 'Log weight'}</CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min={0}
              required={!hasMetrics}
            />
          </div>
          {metrics.map((metric) => {
            const {min, max} = metricRange(metric);
            return (
              <div key={metric.id} className="flex flex-col space-y-2">
                <Label htmlFor={`metric-${metric.id}`}>
                  {metric.label}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({metric.unit})
                  </span>
                </Label>
                <Input
                  id={`metric-${metric.id}`}
                  name={`metric-${metric.id}`}
                  type="number"
                  step={metricStep(metric.decimals)}
                  min={min}
                  max={max}
                />
              </div>
            );
          })}
          {hasMetrics && (
            <p className="text-xs text-muted-foreground">
              Fill in only what you measured.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : hasMetrics ? 'Save' : 'Log weight'}
          </Button>
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-auto w-full px-0 text-muted-foreground"
          >
            <Link href="/logs?tab=body&manage=1" onClick={onLogCreated}>
              <Plus />
              {hasMetrics ? 'Manage measurements' : 'Track body fat, waist and more'}
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
