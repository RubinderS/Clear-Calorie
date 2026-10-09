'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent} from '@/components/ui/card';
import {Goal} from '@prisma/client';

interface FoodGoalsFormProps {
  goals: Goal | null;
  aiEnabled?: boolean;
}

const SATURATED_FAT_ERROR = 'Saturated fat goal cannot exceed total fat goal.';
const HEALTH_NOTES_MAX = 500;

export function FoodGoalsForm({goals, aiEnabled}: FoodGoalsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthNotes, setHealthNotes] = useState(goals?.healthNotes ?? '');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const data = {
      calorieGoal: Number(formData.get('calorieGoal')),
      proteinGoal: Number(formData.get('proteinGoal')),
      carbsGoal: Number(formData.get('carbsGoal')),
      fatGoal: Number(formData.get('fatGoal')),
      saturatedFatGoal: Number(formData.get('saturatedFatGoal')),
      // Only sent when AI is on, so notes saved earlier survive AI being disabled.
      ...(aiEnabled && {healthNotes: healthNotes.trim() || null}),
    };

    if (data.saturatedFatGoal > data.fatGoal) {
      setError(SATURATED_FAT_ERROR);
      return;
    }
    setError(null);

    setLoading(true);
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="calorieGoal">Calories</Label>
              <Input
                id="calorieGoal"
                name="calorieGoal"
                type="number"
                min={0}
                defaultValue={goals?.calorieGoal ?? 2000}
                required
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="proteinGoal">Protein (g)</Label>
              <Input
                id="proteinGoal"
                name="proteinGoal"
                type="number"
                min={0}
                defaultValue={goals?.proteinGoal ?? 150}
                required
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="carbsGoal">Carbs (g)</Label>
              <Input
                id="carbsGoal"
                name="carbsGoal"
                type="number"
                min={0}
                defaultValue={goals?.carbsGoal ?? 250}
                required
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="fatGoal">Fat (g)</Label>
              <Input
                id="fatGoal"
                name="fatGoal"
                type="number"
                min={0}
                defaultValue={goals?.fatGoal ?? 70}
                required
              />
              <div className="flex flex-col space-y-2 pl-4 border-l-2 border-border/50">
                <Label
                  htmlFor="saturatedFatGoal"
                  className="text-xs text-muted-foreground"
                >
                  of which saturated fat (g)
                </Label>
                <Input
                  id="saturatedFatGoal"
                  name="saturatedFatGoal"
                  type="number"
                  min={0}
                  defaultValue={goals?.saturatedFatGoal ?? 20}
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error ? 'saturatedFatGoal-error' : undefined
                  }
                />
              </div>
            </div>
          </div>
          {error && (
            <p
              id="saturatedFatGoal-error"
              role="alert"
              className="text-sm text-red-500"
            >
              {error}
            </p>
          )}
          {aiEnabled && (
            <div className="flex flex-col space-y-2">
              <Label htmlFor="healthNotes">Health notes</Label>
              <textarea
                id="healthNotes"
                name="healthNotes"
                value={healthNotes}
                onChange={(event) => setHealthNotes(event.target.value)}
                maxLength={HEALTH_NOTES_MAX}
                rows={3}
                placeholder="e.g. High LDL cholesterol, keep sodium low"
                aria-describedby="healthNotes-help"
                className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
              />
              <p
                id="healthNotes-help"
                className="flex justify-between gap-4 text-xs text-muted-foreground"
              >
                <span>
                  When you use AI Estimate, foods that may not suit these notes
                  are flagged. Notes are sent to the AI service. Not medical
                  advice.
                </span>
                <span className="shrink-0 tabular-nums">
                  {healthNotes.length}/{HEALTH_NOTES_MAX}
                </span>
              </p>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save food goal'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
