import Link from 'next/link';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {NutritionProgress} from '@/components/nutrition-progress';
import {BRAND_GRADIENT, LogoGlyph} from '@/lib/app-icon';
import {ArrowRight, HeartPulse} from 'lucide-react';

// Sample data used only to preview the dashboard's progress UI for logged-out visitors.
const previewCalories = {eaten: 1700, burned: 250, goal: 2000};
const previewExercise = {done: 2, total: 3};
const previewMacroItems = [
  {
    label: 'Protein',
    value: 92,
    goal: 150,
    unit: 'g',
    colorClassName: 'text-purple-500',
  },
  {
    label: 'Carbs',
    value: 140,
    goal: 250,
    unit: 'g',
    colorClassName: 'text-blue-500',
  },
  {
    label: 'Fat',
    value: 45,
    goal: 70,
    unit: 'g',
    colorClassName: 'text-amber-500',
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/dashboard');

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4 text-center">
      <div className="mb-8 flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-xl shadow-md"
          style={{background: BRAND_GRADIENT}}
        >
          <LogoGlyph size={34} />
        </span>
        Clear Calorie
      </div>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
        <HeartPulse className="h-4 w-4" />
        Your personal health companion
      </div>
      <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
        Track your health journey with clarity
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Log food, exercise, and weight. Set goals and visualize your progress
        with a clean, modern dashboard.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/register">
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
      <Card className="mt-16 w-full max-w-md text-left">
        <CardHeader>
          <CardTitle>Today&apos;s progress</CardTitle>
          <CardDescription>
            A preview of the dashboard you&apos;ll see after signing in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NutritionProgress
            calories={previewCalories}
            exercise={previewExercise}
            macros={previewMacroItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
