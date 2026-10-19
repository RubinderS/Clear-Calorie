'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select} from '@/components/ui/select';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {cn} from '@/lib/utils';
import {ACTIVITY_LEVELS, FITNESS_GOALS, LIMITS, profileSchema} from '@/lib/tdee';

interface ProfileFormProps {
  defaults: {
    sex: string | null;
    age: number | null;
    heightCm: number | null;
    /** Latest weigh-in. */
    weightKg: number | null;
    bodyFatPct: number | null;
    /** Latest Body fat measurement, offered when the profile has none. */
    loggedBodyFatPct: number | null;
    activityLevel: string | null;
    goal: string | null;
  };
  className?: string;
}

const INVALID_ERROR = 'Check the highlighted values are within range.';

/** Number input with its label and allowed range. */
function NumberField({
  id,
  label,
  limit,
  defaultValue,
  step,
  required = true,
  help,
}: {
  id: keyof typeof LIMITS;
  label: string;
  limit: {min: number; max: number};
  defaultValue: number | null;
  step: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <div className="flex flex-col space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode="decimal"
        min={limit.min}
        max={limit.max}
        step={step}
        defaultValue={defaultValue ?? undefined}
        required={required}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

export function ProfileForm({defaults, className}: ProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState(defaults.goal ?? '');
  const isNew = defaults.goal === null;
  const bodyFatDefault = isNew ? defaults.loggedBodyFatPct : defaults.bodyFatPct;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const bodyFat = String(formData.get('bodyFatPct') ?? '').trim();
    const parsed = profileSchema.safeParse({
      sex: formData.get('sex'),
      age: formData.get('age'),
      heightCm: formData.get('heightCm'),
      weightKg: formData.get('weightKg'),
      bodyFatPct: bodyFat === '' ? null : bodyFat,
      activityLevel: formData.get('activityLevel'),
      goal,
    });
    if (!parsed.success) {
      setError(goal ? INVALID_ERROR : 'Choose a goal.');
      return;
    }
    setError(null);

    setLoading(true);
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (response.ok) {
      router.refresh();
    } else {
      setError('Could not save your profile. Try again.');
    }
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-lg">Your details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <Select
                id="sex"
                name="sex"
                defaultValue={defaults.sex ?? ''}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </div>
            <NumberField
              id="age"
              label="Age"
              limit={LIMITS.age}
              step="1"
              defaultValue={defaults.age}
            />
            <NumberField
              id="heightCm"
              label="Height (cm)"
              limit={LIMITS.heightCm}
              step="0.1"
              defaultValue={defaults.heightCm}
            />
            <NumberField
              id="weightKg"
              label="Weight (kg)"
              limit={LIMITS.weightKg}
              step="0.1"
              defaultValue={defaults.weightKg}
              help={
                defaults.weightKg === null
                  ? 'Saved as your first weigh-in.'
                  : 'A new value is logged as a weigh-in.'
              }
            />
            <div className="col-span-2">
              <NumberField
                id="bodyFatPct"
                label="Body fat % (optional)"
                limit={LIMITS.bodyFatPct}
                step="0.1"
                defaultValue={bodyFatDefault}
                required={false}
                help="If you know it, your calories at rest are worked out from your lean mass, which is more accurate."
              />
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <Label htmlFor="activityLevel">Lifestyle</Label>
            <Select
              id="activityLevel"
              name="activityLevel"
              defaultValue={defaults.activityLevel ?? ''}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {Object.entries(ACTIVITY_LEVELS).map(([key, level]) => (
                <option key={key} value={key}>
                  {level.label}: {level.detail}
                </option>
              ))}
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium leading-none">Goal</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(FITNESS_GOALS).map(([key, option]) => (
                <label
                  key={key}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border border-input bg-background/60 p-3 text-sm shadow-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/10',
                    goal === key && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="goal"
                    value={key}
                    checked={goal === key}
                    onChange={() => setGoal(key)}
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
