import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {isAiEnabled} from '@/lib/ai';
import {ExerciseGoalsForm} from '@/components/exercise-goals-form';

export default async function ExercisePlanPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const exerciseGoals = await prisma.exerciseGoal.findMany({
    where: {userId: session.user.id},
    orderBy: {createdAt: 'asc'},
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Exercise Plan</h1>
        <p className="text-muted-foreground">
          Plan the exercises you want to do each day
        </p>
      </div>

      <ExerciseGoalsForm goals={exerciseGoals} aiEnabled={isAiEnabled()} />
    </div>
  );
}
