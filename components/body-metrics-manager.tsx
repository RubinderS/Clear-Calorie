'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Archive, ChevronDown, Plus, RotateCcw, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BODY_METRIC_PRESETS,
  DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  type BodyMetricPresetKey,
  type TrackedMetric,
} from '@/lib/body-metrics';

type ArchivedMetric = TrackedMetric & {logCount: number};

type BodyMetricsManagerProps = {
  active: TrackedMetric[];
  archived: ArchivedMetric[];
  /** Start with the dialog open, e.g. from the quick-log form's link. */
  defaultOpen?: boolean;
};

type Request = {url: string; method: string; body?: unknown};

/**
 * A button opening a dialog to choose which body metrics to track, add custom
 * ones, archive and restore.
 */
export function BodyMetricsManager({
  active,
  archived,
  defaultOpen = false,
}: BodyMetricsManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An archived custom metric with the name the user just tried to add.
  const [restoreOffer, setRestoreOffer] = useState<ArchivedMetric | null>(null);

  async function send(id: string, {url, method, body}: Request) {
    setPending(id);
    setError(null);
    setRestoreOffer(null);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? {'Content-Type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) {
        router.refresh();
        return true;
      }
      const data = await response.json().catch(() => null);
      const match = archived.find((metric) => metric.id === data?.archivedId);
      if (match) setRestoreOffer(match);
      else setError(data?.error ?? 'Something went wrong');
      return false;
    } finally {
      setPending(null);
    }
  }

  const setArchived = (metric: TrackedMetric, value: boolean) =>
    send(metric.id, {
      url: `/api/body-metrics?id=${metric.id}`,
      method: 'PATCH',
      body: {archived: value},
    });

  async function remove(metric: ArchivedMetric) {
    const history =
      metric.logCount > 0
        ? ` and its ${metric.logCount} ${metric.logCount === 1 ? 'entry' : 'entries'}`
        : '';
    if (
      !window.confirm(
        `Delete ${metric.label}${history}? This cannot be undone.`,
      )
    ) {
      return;
    }
    await send(metric.id, {
      url: `/api/body-metrics?id=${metric.id}`,
      method: 'DELETE',
    });
  }

  function close() {
    setOpen(false);
    // Drop ?manage=1 so a reload doesn't reopen the dialog.
    if (defaultOpen) router.replace('/logs?tab=body', {scroll: false});
    setError(null);
    setRestoreOffer(null);
  }

  const activeKeys = new Set(active.map((metric) => metric.key));
  const presets = (
    Object.keys(BODY_METRIC_PRESETS) as BodyMetricPresetKey[]
  ).filter((key) => !activeKeys.has(key));
  const archivedKeys = new Set(archived.map((metric) => metric.key));

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        Add measurement
      </Button>
      <Dialog open={open} onClose={close} label="Body measurements">
    <Card>
      <CardHeader className="pr-14">
        <CardTitle>Body measurements</CardTitle>
        <CardDescription>
          Optional. Choose what you want to track, and log it from the Weight
          button on the Dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {restoreOffer && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 p-3 text-sm"
          >
            <span>
              You archived <strong>{restoreOffer.label}</strong> before. Restore
              it with its history?
            </span>
            <Button
              size="sm"
              disabled={pending !== null}
              onClick={() => void setArchived(restoreOffer, false)}
            >
              <RotateCcw />
              Restore
            </Button>
          </div>
        )}

        {presets.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Add a measurement</h3>
            <ul className="space-y-2">
              {presets.map((key) => (
                <PresetRow
                  key={key}
                  presetKey={key}
                  wasArchived={archivedKeys.has(key)}
                  disabled={pending !== null}
                  onAdd={(unit) =>
                    void send(key, {
                      url: '/api/body-metrics',
                      method: 'POST',
                      body: {key, unit},
                    })
                  }
                />
              ))}
            </ul>
          </section>
        )}

        <CustomMetricForm
          disabled={pending !== null}
          onAdd={(body) =>
            send('custom', {url: '/api/body-metrics', method: 'POST', body})
          }
        />

        {active.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Tracking</h3>
            <ul className="space-y-2">
              {active.map((metric) => (
                <li
                  key={metric.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 py-1 pl-4 pr-1"
                >
                  <span>
                    {metric.label}{' '}
                    <span className="text-muted-foreground">({metric.unit})</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null}
                    aria-label={`Archive ${metric.label}`}
                    title="Hide this metric. Its history is kept."
                    onClick={() => void setArchived(metric, true)}
                  >
                    <Archive />
                    Archive
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {archived.length > 0 && (
          <details className="group rounded-xl border border-border/50">
            <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Archived ({archived.length})
              <ChevronDown
                className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <ul className="space-y-2 px-3 pb-3">
              {archived.map((metric) => (
                <li
                  key={metric.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm">
                    {metric.label}{' '}
                    <span className="text-muted-foreground">
                      ({metric.unit}) · {metric.logCount}{' '}
                      {metric.logCount === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      aria-label={`Restore ${metric.label}`}
                      onClick={() => void setArchived(metric, false)}
                    >
                      <RotateCcw />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending !== null}
                      aria-label={`Delete ${metric.label} permanently`}
                      onClick={() => void remove(metric)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/30 dark:hover:text-red-200"
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
      </Dialog>
    </>
  );
}

function PresetRow({
  presetKey,
  wasArchived,
  disabled,
  onAdd,
}: {
  presetKey: BodyMetricPresetKey;
  wasArchived: boolean;
  disabled: boolean;
  onAdd: (unit: string) => void;
}) {
  const preset = BODY_METRIC_PRESETS[presetKey];
  const units: readonly string[] = preset.units;
  const [unit, setUnit] = useState(units[0]);

  return (
    <li className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 py-1 pl-4 pr-1">
      <span className="flex-1 text-sm">
        {preset.label}
        {wasArchived && (
          <span className="block text-xs text-muted-foreground">
            Restores your history
          </span>
        )}
      </span>
      {units.length > 1 ? (
        <Select
          aria-label={`${preset.label} unit`}
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          className="h-9"
          wrapperClassName="w-20 shrink-0"
        >
          {units.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
      ) : (
        // Same width as the dropdowns, so every row's Add button lines up.
        <span className="w-20 shrink-0 px-3 text-sm text-muted-foreground">
          {unit}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={`Track ${preset.label}`}
        onClick={() => onAdd(unit)}
      >
        <Plus />
        Add
      </Button>
    </li>
  );
}

function CustomMetricForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (body: {label: string; unit: string; direction: string}) => Promise<boolean>;
}) {
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const added = await onAdd({
      label: String(formData.get('label') ?? ''),
      unit: String(formData.get('unit') ?? ''),
      direction: String(formData.get('direction') ?? 'neutral'),
    });
    if (added) form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-medium">Add your own</h3>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col space-y-2">
          <Label htmlFor="metric-label">Name</Label>
          <Input
            id="metric-label"
            name="label"
            placeholder="e.g. Bicep"
            maxLength={40}
            required
          />
        </div>
        <div className="flex flex-col space-y-2">
          <Label htmlFor="metric-unit">Unit</Label>
          <Input
            id="metric-unit"
            name="unit"
            placeholder="e.g. cm"
            maxLength={12}
            required
          />
        </div>
        <div className="flex flex-col space-y-2 sm:col-span-2">
          <Label htmlFor="metric-direction">Goal</Label>
          <Select id="metric-direction" name="direction" defaultValue="neutral">
            {METRIC_DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABELS[direction]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={disabled}>
        <Plus />
        Add custom measurement
      </Button>
    </form>
  );
}
