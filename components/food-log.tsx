'use client';

import {useState} from 'react';
import {AlertTriangle, Utensils} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {sumNumbers} from '@/lib/decimal';
import {cn} from '@/lib/utils';

type FoodEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  healthAlertLevel?: string | null;
  healthAlertMessage?: string | null;
  loggedAt: string | Date;
};

type FoodLogProps = {
  entries: FoodEntry[];
  timeZone: string;
  today: string;
};

const alertColor = (level?: string | null) =>
  level === 'avoid'
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400';

export function FoodLog({entries, timeZone, today}: FoodLogProps) {
  const log = useDailyLog({
    endpoint: '/api/food',
    initialEntries: entries,
    today,
  });
  const totalCalories = sumNumbers(log.entries.map((entry) => entry.calories));
  const [alertEntry, setAlertEntry] = useState<FoodEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  return (
    <>
      <DailyLogCard
        log={log}
        timeZone={timeZone}
        todayTitle="Today's entries"
        dateInputLabel="View food logs for date"
        summary={`${totalCalories} calories`}
        loadingText="Loading entries..."
        emptyText="No food logged"
        icon={Utensils}
        iconClassName="bg-primary/10 text-primary"
        renderDetail={(entry) =>
          `P: ${entry.protein}g · C: ${entry.carbs}g · F: ${entry.fat}g · Sat: ${entry.saturatedFat}g`
        }
        renderBadge={(entry) =>
          entry.healthAlertMessage && (
            <button
              type="button"
              aria-label={`Show health alert for ${entry.name}`}
              title="Health alert"
              onClick={() => setAlertEntry(entry)}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
                alertColor(entry.healthAlertLevel),
                entry.healthAlertLevel === 'avoid'
                  ? 'bg-red-500/10 hover:bg-red-500/20'
                  : 'bg-amber-500/10 hover:bg-amber-500/20',
              )}
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
            </button>
          )
        }
        onEdit={setEditingEntry}
      />
      <Dialog
        open={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        label="Edit food"
      >
        {editingEntry && (
          <EditFoodForm
            entry={editingEntry}
            onSaved={(updated) => {
              log.replaceEntry(updated);
              setEditingEntry(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={alertEntry !== null}
        onClose={() => setAlertEntry(null)}
        label="Health alert"
      >
        {alertEntry && (
          <div className="space-y-3 p-6">
            <div
              className={cn(
                'flex items-center gap-2 pr-8 font-semibold',
                alertColor(alertEntry.healthAlertLevel),
              )}
            >
              <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
              {alertEntry.healthAlertLevel === 'avoid'
                ? 'Best avoided'
                : 'Eat with caution'}
            </div>
            <p className="font-medium">{alertEntry.name}</p>
            <p className="text-sm">{alertEntry.healthAlertMessage}</p>
            <p className="text-xs text-muted-foreground">
              Raised by the AI estimate based on your health notes. Not
              medical advice.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}

const NUTRIENT_FIELDS = [
  {field: 'calories', label: 'Calories', required: true},
  {field: 'protein', label: 'Protein (g)'},
  {field: 'carbs', label: 'Carbs (g)'},
  {field: 'fat', label: 'Fat (g)'},
  {field: 'saturatedFat', label: 'Saturated fat (g)'},
] as const;

type NutrientField = (typeof NUTRIENT_FIELDS)[number]['field'];

type EditFoodFormProps = {
  entry: FoodEntry;
  onSaved: (entry: FoodEntry) => void;
};

function EditFoodForm({entry, onSaved}: EditFoodFormProps) {
  const [name, setName] = useState(entry.name);
  const [values, setValues] = useState<Record<NutrientField, string>>(() => ({
    calories: String(entry.calories),
    protein: String(entry.protein),
    carbs: String(entry.carbs),
    fat: String(entry.fat),
    saturatedFat: String(entry.saturatedFat),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const numbers = Object.fromEntries(
      NUTRIENT_FIELDS.map(({field}) => [field, Number(values[field] || 0)]),
    ) as Record<NutrientField, number>;
    if (numbers.saturatedFat > numbers.fat) {
      setError('Saturated fat cannot exceed total fat');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/food', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: entry.id, name: name.trim(), ...numbers}),
      });

      if (response.ok) {
        onSaved(await response.json());
      } else {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? 'Failed to update food');
      }
    } catch {
      setError('Failed to update food');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <div className="pr-8">
        <h2 className="text-lg font-semibold">Edit food</h2>
        <p className="text-sm text-muted-foreground">
          Correct the portion or nutrition details.
        </p>
      </div>
      <div className="flex flex-col space-y-2">
        <Label htmlFor="edit-food-name">Food name</Label>
        <Input
          id="edit-food-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {NUTRIENT_FIELDS.map(({field, label, ...rest}) => (
          <div key={field} className="flex flex-col space-y-2">
            <Label htmlFor={`edit-food-${field}`}>{label}</Label>
            <Input
              id={`edit-food-${field}`}
              type="number"
              min={0}
              step="any"
              placeholder="0"
              value={values[field]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
              required={'required' in rest}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </form>
  );
}
