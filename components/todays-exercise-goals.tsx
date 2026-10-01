import Link from 'next/link';
import {CheckCircle2, Circle} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {formatExerciseDetail} from '@/lib/exercise';

type TodaysExerciseGoal = {
  id: string;
  name: string;
  type: string;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  completed: boolean;
};

export function TodaysExerciseGoals({goals}: {goals: TodaysExerciseGoal[]}) {
  const doneCount = goals.filter((goal) => goal.completed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s exercise goals</CardTitle>
        <CardDescription>
          {goals.length > 0
            ? `${doneCount} of ${goals.length} done`
            : 'Nothing planned for today'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/goals" className="text-primary hover:underline">
              Plan exercise goals
            </Link>{' '}
            for the days of the week.
          </p>
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-start gap-3">
                {goal.completed ? (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-green-500"
                    aria-label="Done"
                  />
                ) : (
                  <Circle
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-label="Not done"
                  />
                )}
                <div className="min-w-0">
                  <p
                    className={
                      goal.completed
                        ? 'truncate font-medium text-muted-foreground line-through'
                        : 'truncate font-medium'
                    }
                  >
                    {goal.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatExerciseDetail(goal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {goals.length > 0 && (
          <Link
            href="/exercise"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            Tick off exercises
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
