'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Goal} from '@prisma/client';

interface GoalsFormProps {
  goals: Goal | null;
}

export function GoalsForm({goals}: GoalsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const data = {
      calorieGoal: Number(formData.get('calorieGoal')),
      proteinGoal: Number(formData.get('proteinGoal')),
      carbsGoal: Number(formData.get('carbsGoal')),
      fatGoal: Number(formData.get('fatGoal')),
      weightGoal: formData.get('weightGoal')
        ? Number(formData.get('weightGoal'))
        : null,
    };

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
      <CardHeader>
        <CardTitle>Update goals</CardTitle>
      </CardHeader>
      <CardContent>
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
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="weightGoal">Weight goal</Label>
              <Input
                id="weightGoal"
                name="weightGoal"
                type="number"
                step="0.1"
                min={0}
                defaultValue={goals?.weightGoal ?? ''}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save goals'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
