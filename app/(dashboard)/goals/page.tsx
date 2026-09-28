import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {GoalsForm} from '@/components/goals-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default async function GoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const goals = await prisma.goal.findUnique({
    where: {userId: session.user.id},
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Goals</h1>
        <p className="text-muted-foreground">
          Set your daily nutrition targets
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GoalsForm goals={goals} />

        <Card>
          <CardHeader>
            <CardTitle>Current goals</CardTitle>
            <CardDescription>Your daily nutrition targets</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {[
                {
                  label: 'Calories',
                  value: goals?.calorieGoal ?? 2000,
                  unit: '',
                },
                {label: 'Protein', value: goals?.proteinGoal ?? 150, unit: 'g'},
                {label: 'Carbs', value: goals?.carbsGoal ?? 250, unit: 'g'},
                {label: 'Fat', value: goals?.fatGoal ?? 70, unit: 'g'},
                {
                  label: 'Weight goal',
                  value: goals?.weightGoal ?? '—',
                  unit: '',
                },
              ].map((goal) => (
                <div
                  key={goal.label}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4"
                >
                  <dt className="text-muted-foreground">{goal.label}</dt>
                  <dd className="font-semibold">
                    {goal.value}
                    {goal.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
