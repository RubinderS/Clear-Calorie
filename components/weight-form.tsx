'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

type WeightFormProps = {
  onLogCreated?: () => void;
  /** Shown under the title, e.g. a link to past logs. */
  headerAction?: React.ReactNode;
};

export function WeightForm({onLogCreated, headerAction}: WeightFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const data = {
      weight: Number(formData.get('weight')),
    };

    const response = await fetch('/api/weight', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (response.ok) {
      (event.target as HTMLFormElement)?.reset();
      onLogCreated?.();
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="pr-14">
        <CardTitle>Log weight</CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min={0}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Log weight'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
