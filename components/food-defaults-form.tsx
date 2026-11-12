'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

const FOOD_DEFAULTS_MAX = 1000;

/** Standing portion and preparation assumptions the AI applies to every food estimate. */
export function FoodDefaultsForm({foodDefaults}: {foodDefaults: string | null}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(foodDefaults ?? '');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    setLoading(true);
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({foodDefaults: value.trim() || null}),
    });
    setLoading(false);

    if (response.ok) {
      router.refresh();
    } else {
      setError('Could not save your food defaults. Try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">My food defaults</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="foodDefaults" className="sr-only">
              My food defaults
            </Label>
            <textarea
              id="foodDefaults"
              name="foodDefaults"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={FOOD_DEFAULTS_MAX}
              rows={5}
              placeholder="e.g. 1 plate rice = 70g cooked rice. 1 plate curry/daal = 200g. Curries are always no-oil. Roti = 40g, no ghee. Tea has 50ml full-cream milk, no sugar."
              aria-describedby="foodDefaults-help"
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
            />
            <p
              id="foodDefaults-help"
              className="flex justify-between gap-4 text-xs text-muted-foreground"
            >
              <span>
                The AI always assumes these when you log food or ask the coach,
                unless you say otherwise. Sent to the AI service.
              </span>
              <span className="shrink-0 tabular-nums">
                {value.length}/{FOOD_DEFAULTS_MAX}
              </span>
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save food defaults'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
