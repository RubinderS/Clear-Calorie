'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

const FOOD_PREFERENCES_MAX = 500;

/** Likes, dislikes and diet the AI coach and weekly report keep to. */
export function FoodPreferencesForm({
  foodPreferences,
}: {
  foodPreferences: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(foodPreferences ?? '');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    setLoading(true);
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({foodPreferences: value.trim() || null}),
    });
    setLoading(false);

    if (response.ok) {
      router.refresh();
    } else {
      setError('Could not save your food preferences. Try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Food preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="foodPreferences" className="sr-only">
              Food preferences
            </Label>
            <textarea
              id="foodPreferences"
              name="foodPreferences"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={FOOD_PREFERENCES_MAX}
              rows={3}
              placeholder="e.g. Vegetarian, love Indian food, no mushrooms, lactose intolerant"
              aria-describedby="foodPreferences-help"
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
            />
            <p
              id="foodPreferences-help"
              className="flex justify-between gap-4 text-xs text-muted-foreground"
            >
              <span>
                The coach and your weekly report keep to these when suggesting
                foods and swaps. Sent to the AI service.
              </span>
              <span className="shrink-0 tabular-nums">
                {value.length}/{FOOD_PREFERENCES_MAX}
              </span>
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save food preferences'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
