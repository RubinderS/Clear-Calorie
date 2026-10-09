import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {isAiEnabled} from '@/lib/ai';
import {FoodGoalsForm} from '@/components/food-goals-form';

export default async function FoodGoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const goals = await prisma.goal.findUnique({
    where: {userId: session.user.id},
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Food Goals</h1>
        <p className="text-muted-foreground">
          Set your daily nutrition targets
        </p>
      </div>

      <FoodGoalsForm goals={goals} aiEnabled={isAiEnabled()} />
    </div>
  );
}
