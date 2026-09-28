'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

type SavedFoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function FoodForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFoods, setSavedFoods] = useState<SavedFoodItem[]>([]);

  useEffect(() => {
    fetch('/api/saved-food')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSavedFoods(data);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });
  }, []);

  function applySavedFood(item: SavedFoodItem) {
    const form = document.getElementById('food-form') as HTMLFormElement | null;
    if (!form) return;

    (form.elements.namedItem('name') as HTMLInputElement).value = item.name;
    (form.elements.namedItem('calories') as HTMLInputElement).value = String(
      item.calories,
    );
    (form.elements.namedItem('protein') as HTMLInputElement).value = String(
      item.protein,
    );
    (form.elements.namedItem('carbs') as HTMLInputElement).value = String(
      item.carbs,
    );
    (form.elements.namedItem('fat') as HTMLInputElement).value = String(
      item.fat,
    );
  }

  async function saveCurrentFood() {
    const form = document.getElementById('food-form') as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    const name = (formData.get('name') as string)?.trim();
    if (!name) return;

    const data = {
      name,
      calories: Number(formData.get('calories')),
      protein: Number(formData.get('protein')),
      carbs: Number(formData.get('carbs')),
      fat: Number(formData.get('fat')),
    };

    setSaving(true);
    const response = await fetch('/api/saved-food', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    setSaving(false);

    if (response.ok) {
      const updated = await response.json();
      setSavedFoods((prev) => {
        const exists = prev.find((item) => item.id === updated.id);
        if (exists) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
      });
    }
  }

  async function deleteSavedFood(id: string) {
    const response = await fetch(`/api/saved-food?id=${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setSavedFoods((prev) => prev.filter((item) => item.id !== id));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const data = {
      name: formData.get('name') as string,
      calories: Number(formData.get('calories')),
      protein: Number(formData.get('protein')),
      carbs: Number(formData.get('carbs')),
      fat: Number(formData.get('fat')),
    };

    const response = await fetch('/api/food', {
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
        <CardTitle>Add food</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="food-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="name">Food name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                name="calories"
                type="number"
                min={0}
                required
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="protein">Protein (g)</Label>
              <Input
                id="protein"
                name="protein"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="carbs">Carbs (g)</Label>
              <Input
                id="carbs"
                name="carbs"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="fat">Fat (g)</Label>
              <Input
                id="fat"
                name="fat"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Log food'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={saveCurrentFood}
            className="w-full"
          >
            {saving ? 'Saving...' : 'Save food item for later'}
          </Button>
        </form>

        {savedFoods.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-semibold">Saved food items</h4>
            <ul className="space-y-2">
              {savedFoods.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.calories} kcal · P: {item.protein}g · C:{' '}
                      {item.carbs}g · F: {item.fat}g
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applySavedFood(item)}
                    >
                      Use
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSavedFood(item.id)}
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
