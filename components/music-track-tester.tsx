'use client';

import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {
  createWorkoutMusic,
  MUSIC_TRACKS,
  type WorkoutMusic,
} from '@/lib/workout-music';
import {unlockAudio} from '@/lib/workout-sound';

// TODO: temporary, for trying out the music tracks. Remove once they're tuned.
export function MusicTrackTester() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  const music = useRef<WorkoutMusic | null>(null);
  const request = useRef(0);

  useEffect(() => () => music.current?.dispose(), []);

  function play(name: string) {
    unlockAudio();
    music.current?.dispose();
    music.current = null;
    const id = ++request.current;
    if (playing === name) {
      setPlaying(null);
      return;
    }
    setPlaying(name);
    createWorkoutMusic(name)
      .then((instance) => {
        if (id !== request.current) return instance.dispose();
        music.current = instance;
        instance.setIntensity(resting ? 'rest' : 'set');
        instance.setPlaying(true);
      })
      .catch(() => setPlaying(null));
  }

  function toggleRest() {
    music.current?.setIntensity(resting ? 'set' : 'rest');
    setResting(!resting);
  }

  return (
    <div role="group" aria-label="Test music tracks" className="space-y-2">
      <p className="text-xs text-muted-foreground">Test tracks</p>
      <div className="grid grid-cols-2 gap-2">
        {MUSIC_TRACKS.map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={playing === name ? 'default' : 'outline'}
            aria-pressed={playing === name}
            onClick={() => play(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant={resting ? 'default' : 'outline'}
        className="w-full"
        aria-pressed={resting}
        onClick={toggleRest}
      >
        Rest {resting ? 'on' : 'off'}
      </Button>
    </div>
  );
}
