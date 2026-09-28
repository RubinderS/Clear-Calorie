'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

type SavedExerciseItem = {
  id: string;
  name: string;
  calories: number;
  durationMin: number;
};

export function ExerciseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedExercises, setSavedExercises] = useState<SavedExerciseItem[]>([]);

  useEffect(() => {
    fetch('/api/saved-exercise')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSavedExercises(data);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });
  }, []);

  function applySavedExercise(item: SavedExerciseItem) {
    const form = document.getElementById(
      'exercise-form',
    ) as HTMLFormElement | null;
    if (!form) return;

    (form.elements.namedItem('name') as HTMLInputElement).value = item.name;
    (form.elements.namedItem('calories') as HTMLInputElement).value = String(
      item.calories,
    );
    (form.elements.namedItem('durationMin') as HTMLInputElement).value = String(
      item.durationMin,
    );
  }

  async function saveCurrentExercise() {
    const form = document.getElementById(
      'exercise-form',
    ) as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    const name = (formData.get('name') as string)?.trim();
    if (!name) return;

    const data = {
      name,
      calories: Number(formData.get('calories')),
      durationMin: Number(formData.get('durationMin')),
    };

    setSaving(true);
    const response = await fetch('/api/saved-exercise', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    setSaving(false);

    if (response.ok) {
      const updated = await response.json();
      setSavedExercises((prev) => {
        const exists = prev.find((item) => item.id === updated.id);
        if (exists) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
      });
    }
  }

  async function deleteSavedExercise(id: string) {
    const response = await fetch(`/api/saved-exercise?id=${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setSavedExercises((prev) => prev.filter((item) => item.id !== id));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const data = {
      name: formData.get('name') as string,
      calories: Number(formData.get('calories')),
      durationMin: Number(formData.get('durationMin')),
    };

    const response = await fetch('/api/exercise', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (response.ok) {
      (event.target as HTMLFormElement)?.reset();
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add exercise</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="exercise-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="name">Activity</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="calories">Calories burned</Label>
              <Input
                id="calories"
                name="calories"
                type="number"
                min={0}
                required
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="durationMin">Duration (min)</Label>
              <Input
                id="durationMin"
                name="durationMin"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Log exercise'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={saveCurrentExercise}
            className="w-full"
          >
            {saving ? 'Saving...' : 'Save exercise item for later'}
          </Button>
        </form>

        {savedExercises.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-semibold">Saved exercise items</h4>
            <ul className="space-y-2">
              {savedExercises.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.calories} kcal · {item.durationMin} min
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applySavedExercise(item)}
                    >
                      Use
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSavedExercise(item.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
