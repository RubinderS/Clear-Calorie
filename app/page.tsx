import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {ArrowRight, HeartPulse, LineChart, Utensils} from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4 text-center">
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
      <div className="mt-16 grid max-w-2xl gap-6 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-left shadow-sm backdrop-blur">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Utensils className="h-5 w-5" />
          </div>
          <h3 className="font-semibold">Food logging</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Track calories and macros for every meal.
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-left shadow-sm backdrop-blur">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
            <HeartPulse className="h-5 w-5" />
          </div>
          <h3 className="font-semibold">Exercise</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Record workouts and calories burned.
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-left shadow-sm backdrop-blur">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <LineChart className="h-5 w-5" />
          </div>
          <h3 className="font-semibold">Insights</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualize trends and reach your goals.
          </p>
        </div>
      </div>
    </div>
  );
}
