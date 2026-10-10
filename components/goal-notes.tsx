'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Pencil} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {EXERCISE_NOTES_MAX} from '@/lib/exercise';

function saveNotes(goalId: string, notes: string) {
  return fetch('/api/exercise-goals', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: goalId, notes}),
  });
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
// Sentence punctuation after a URL isn't part of it.
const URL_TRAILING = /[.,;:!?)\]}'"]+$/;

/** Renders text with any URLs as links that open in a new tab. */
function Linkified({text}: {text: string}) {
  return text.split(URL_PATTERN).map((part, index) => {
    // split() with a capture group puts the matches at odd indexes.
    if (index % 2 === 0) return part;
    const trailing = part.match(URL_TRAILING)?.[0] ?? '';
    const url = part.slice(0, part.length - trailing.length);
    return (
      <span key={index}>
        <a
          href={url.startsWith('www.') ? `https://${url}` : url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2"
        >
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

type GoalNotesProps = {
  goalId: string;
  initialNotes: string | null;
  onSaved?: (notes: string | null) => void;
};

/** Planned goal notes, shown as text with links; Edit switches to a textarea. */
export function GoalNotes({goalId, initialNotes, onSaved}: GoalNotesProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    setError(false);
    try {
      const response = await saveNotes(goalId, draft);
      if (!response.ok) throw new Error();
      setNotes(draft.trim());
      setDraft(null);
      onSaved?.(draft.trim() || null);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const inputId = `goalNotes-${goalId}`;
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between gap-2">
        {draft === null ? (
          <h3 className="text-sm font-medium">Notes</h3>
        ) : (
          <Label htmlFor={inputId}>Notes</Label>
        )}
        {draft === null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraft(notes)}
          >
            <Pencil />
            {notes ? 'Edit' : 'Add'}
          </Button>
        )}
      </div>
      {draft === null ? (
        notes ? (
          <p className="whitespace-pre-line break-words rounded-xl border border-border/50 bg-muted/30 px-4 py-2 text-sm">
            <Linkified text={notes} />
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )
      ) : (
        <>
          <textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={EXERCISE_NOTES_MAX}
            rows={3}
            autoFocus
            placeholder="Add notes for this exercise"
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          Couldn&apos;t save notes. Try again.
        </p>
      )}
    </div>
  );
}
