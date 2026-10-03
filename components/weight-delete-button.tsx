'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';

type WeightDeleteButtonProps = {
  entryId: string;
  label: string;
};

export function WeightDeleteButton({entryId, label}: WeightDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/weight?id=${entryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      disabled={isDeleting}
      onClick={() => void handleDelete()}
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/30 dark:hover:text-red-200"
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}
