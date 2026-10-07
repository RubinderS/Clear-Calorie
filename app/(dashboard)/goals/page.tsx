import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {isAiEnabled} from '@/lib/ai';
import {FoodGoalsForm} from '@/components/food-goals-form';
import {WeightGoalForm} from '@/components/weight-goal-form';
import {ExerciseGoalsForm} from '@/components/exercise-goals-form';

export default async function GoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const [goals, exerciseGoals] = await Promise.all([
    prisma.goal.findUnique({where: {userId: session.user.id}}),
    prisma.exerciseGoal.findMany({
      where: {userId: session.user.id},
      orderBy: {createdAt: 'asc'},
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Goals</h1>
        <p className="text-muted-foreground">
          Set your daily nutrition, weight, and exercise targets
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FoodGoalsForm goals={goals} aiEnabled={isAiEnabled()} />
        <WeightGoalForm goals={goals} />
      </div>

      <ExerciseGoalsForm goals={exerciseGoals} aiEnabled={isAiEnabled()} />
    </div>
  );
}
