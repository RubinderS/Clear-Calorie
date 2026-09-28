'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Goal} from '@prisma/client';

interface WeightGoalFormProps {
  goals: Goal | null;
}

export function WeightGoalForm({goals}: WeightGoalFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const data = {
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
        <CardTitle>Weight goal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="weightGoal">Target weight</Label>
            <Input
              id="weightGoal"
              name="weightGoal"
              type="number"
              step="0.1"
              min={0}
              defaultValue={goals?.weightGoal ?? ''}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save weight goal'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
