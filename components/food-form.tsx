'use client';

import {useEffect, useMemo, useState} from 'react';
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
  saturatedFat: number;
  isPinned: boolean;
};

const SATURATED_FAT_ERROR = 'Saturated fat cannot exceed total fat.';
const MAX_SUGGESTIONS = 8;

type FoodFormProps = {
  onLogCreated?: () => void;
};

export function FoodForm({onLogCreated}: FoodFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [savedFoods, setSavedFoods] = useState<SavedFoodItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  const suggestions = useMemo(() => {
    const query = name.trim().toLowerCase();
    const pool = query
      ? savedFoods.filter((item) => item.name.toLowerCase().includes(query))
      : savedFoods.filter((item) => item.isPinned);

    return [...pool]
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [name, savedFoods]);

  function applySuggestion(item: SavedFoodItem) {
    const form = document.getElementById('food-form') as HTMLFormElement | null;
    if (!form) return;

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
    (form.elements.namedItem('saturatedFat') as HTMLInputElement).value =
      String(item.saturatedFat);

    setName(item.name);
    setSelectedId(item.id);
    setIsSaved(true);
    setIsPinned(item.isPinned);
    setShowSuggestions(false);
    setError(null);
    setSaveError(null);
  }

  async function deleteSavedFood(item: SavedFoodItem, event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    if (
      !window.confirm(
        `Delete saved food "${item.name}"? This cannot be undone. Existing food logs will not be affected.`,
      )
    ) {
      return;
    }

    const {id} = item;
    const response = await fetch(`/api/saved-food?id=${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setSavedFoods((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
    }
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value);
    setSelectedId(null);
    setShowSuggestions(true);
    setSaveError(null);
  }

  function handleSaveChange(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setIsSaved(checked);
    if (!checked) {
      setIsPinned(false);
    }
    setSaveError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const data = {
      name: (formData.get('name') as string)?.trim(),
      calories: Number(formData.get('calories')),
      protein: Number(formData.get('protein')),
      carbs: Number(formData.get('carbs')),
      fat: Number(formData.get('fat')),
      saturatedFat: Number(formData.get('saturatedFat')),
    };

    if (data.saturatedFat > data.fat) {
      setError(SATURATED_FAT_ERROR);
      return;
    }
    setError(null);
    setSaveError(null);

    setLoading(true);

    if (isSaved) {
      const saveResponse = await fetch('/api/saved-food', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: selectedId ?? undefined,
          ...data,
          isPinned,
        }),
      });

      if (!saveResponse.ok) {
        const payload = await saveResponse.json().catch(() => null);
        setSaveError(payload?.error ?? 'Failed to save food item');
        setLoading(false);
        return;
      }

      const updated = await saveResponse.json();
      setSavedFoods((prev) => {
        const exists = prev.find((item) => item.id === updated.id);
        if (exists) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedId(updated.id);
    }

    const response = await fetch('/api/food', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (response.ok) {
      (event.target as HTMLFormElement)?.reset();
      setName('');
      setSelectedId(null);
      setIsSaved(false);
      setIsPinned(false);
      onLogCreated?.();
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
          <div className="relative flex flex-col space-y-2">
            <Label htmlFor="name">Food name</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={handleNameChange}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoComplete="off"
              required
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border/50 bg-background shadow-lg">
                {suggestions.map((item) => (
                  <li
                    key={item.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySuggestion(item);
                    }}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.isPinned && '📌 '}
                      {item.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.calories} kcal
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onMouseDown={(event) => deleteSavedFood(item, event)}
                      className="shrink-0 rounded px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                name="calories"
                type="number"
                min={0}
                step="any"
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
                step="any"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="carbs">Carbs (g)</Label>
              <Input
                id="carbs"
                name="carbs"
                type="number"
                min={0}
                step="any"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="fat">Fat (g)</Label>
              <Input
                id="fat"
                name="fat"
                type="number"
                min={0}
                step="any"
                placeholder="0"
              />
              <div className="flex flex-col space-y-2 pl-4 border-l-2 border-border/50">
                <Label
                  htmlFor="saturatedFat"
                  className="text-xs text-muted-foreground"
                >
                  of which saturated (g)
                </Label>
                <Input
                  id="saturatedFat"
                  name="saturatedFat"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'saturatedFat-error' : undefined}
                />
              </div>
            </div>
          </div>
          {error && (
            <p
              id="saturatedFat-error"
              role="alert"
              className="text-sm text-red-500"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <input
                id="isSaved"
                type="checkbox"
                checked={isSaved}
                onChange={handleSaveChange}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor="isSaved" className="cursor-pointer font-normal">
                Save this item for later
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="isPinned"
                type="checkbox"
                checked={isPinned}
                disabled={!isSaved}
                onChange={(event) => setIsPinned(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Label
                htmlFor="isPinned"
                className="cursor-pointer font-normal peer-disabled:opacity-50"
              >
                Pin this item
              </Label>
            </div>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-red-500">
              {saveError}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Log food'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
