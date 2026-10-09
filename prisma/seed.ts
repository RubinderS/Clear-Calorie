import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { endOfDay, format, subDays, subMinutes } from "date-fns";
import { Decimal } from "@/lib/decimal";
import {
  EVERYDAY_MASK,
  countPlannedOn,
  daysToMask,
  isActiveOn,
} from "@/lib/exercise";

// Days of history to generate, ending today.
const HISTORY_DAYS = 28;

function randomNutritionValue(value: number) {
  if (value === 0) return value;
  const decimalPlaces = randomInt(0, 3);
  if (decimalPlaces === 0) return value;

  const divisor = new Decimal(10).pow(decimalPlaces);
  const fraction = new Decimal(randomInt(1, divisor.toNumber())).div(divisor);
  return new Decimal(value).plus(fraction).toNumber();
}

// Seeded PRNG so the generated history is the same on every reseed.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(42);
const chance = (probability: number) => random() < probability;
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)];

type FoodSeed = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  healthAlertLevel?: "caution" | "avoid";
  healthAlertMessage?: string;
};

const FOODS = {
  oatmeal: {
    name: "Oatmeal",
    calories: 300,
    protein: 10,
    carbs: 54,
    fat: 6,
    saturatedFat: 1,
  },
  yogurt: {
    name: "Greek yogurt",
    calories: 150,
    protein: 15,
    carbs: 10,
    fat: 0,
    saturatedFat: 0,
  },
  salad: {
    name: "Grilled chicken salad",
    calories: 450,
    protein: 45,
    carbs: 12,
    fat: 20,
    saturatedFat: 4,
  },
  rice: {
    name: "Rice and vegetables",
    calories: 500,
    protein: 12,
    carbs: 80,
    fat: 14,
    saturatedFat: 2,
  },
  eggs: {
    name: "Scrambled eggs on sourdough toast",
    calories: 420,
    protein: 24,
    carbs: 32,
    fat: 21,
    saturatedFat: 7,
  },
  burrito: {
    name: "Extra large loaded chicken burrito with guacamole, sour cream, cheese and chipotle sauce",
    calories: 1180,
    protein: 58,
    carbs: 120,
    fat: 52,
    saturatedFat: 21,
    healthAlertLevel: "avoid",
    healthAlertMessage:
      "Very high in saturated fat and calories — this alone uses over half of your daily calorie goal.",
  },
  pizza: {
    name: "Pepperoni pizza (2 slices)",
    calories: 640,
    protein: 26,
    carbs: 72,
    fat: 28,
    saturatedFat: 12,
    healthAlertLevel: "caution",
    healthAlertMessage: "High in saturated fat and sodium.",
  },
  shake: {
    name: "Protein shake",
    calories: 220,
    protein: 40,
    carbs: 8,
    fat: 3,
    saturatedFat: 1,
  },
  salmon: {
    name: "Baked salmon with quinoa",
    calories: 610,
    protein: 42,
    carbs: 48,
    fat: 26,
    saturatedFat: 5,
  },
  apple: {
    name: "Apple",
    calories: 95,
    protein: 0,
    carbs: 25,
    fat: 0,
    saturatedFat: 0,
  },
  almonds: {
    name: "Almonds (handful)",
    calories: 170,
    protein: 6,
    carbs: 6,
    fat: 15,
    saturatedFat: 1,
  },
  croissant: {
    name: "Butter croissant",
    calories: 340,
    protein: 6,
    carbs: 38,
    fat: 19,
    saturatedFat: 11,
    healthAlertLevel: "caution",
    healthAlertMessage: "Over half of your daily saturated fat goal.",
  },
} satisfies Record<string, FoodSeed>;

const BREAKFASTS = [FOODS.oatmeal, FOODS.eggs, FOODS.yogurt, FOODS.croissant];
const LUNCHES = [FOODS.salad, FOODS.rice, FOODS.burrito, FOODS.salmon];
const DINNERS = [FOODS.salmon, FOODS.rice, FOODS.pizza, FOODS.salad];
const SNACKS = [FOODS.apple, FOODS.almonds, FOODS.shake, FOODS.yogurt];

type GoalSeed = {
  key: string;
  name: string;
  type: "TIME" | "STRENGTH";
  calories: number;
  durationMin?: number;
  sets?: number;
  reps?: number;
  weight?: number;
  days: readonly number[];
  // Days ago the goal was added to the plan
  createdDaysAgo: number;
};

// Mixes TIME and STRENGTH goals, short and very long names, and goals added
// part-way through the history (so earlier days plan fewer exercises).
const GOALS: readonly GoalSeed[] = [
  {
    key: "run",
    name: "Morning run",
    type: "TIME",
    calories: 320,
    durationMin: 30,
    days: [1, 3, 5],
    createdDaysAgo: HISTORY_DAYS,
  },
  {
    key: "squat",
    name: "Barbell back squat with a two-second pause at the bottom and controlled tempo",
    type: "STRENGTH",
    calories: 240,
    sets: 4,
    reps: 8,
    weight: 135,
    days: [2, 4],
    createdDaysAgo: HISTORY_DAYS,
  },
  {
    key: "walk",
    name: "Evening walk around the neighbourhood park, along the river and back home again",
    type: "TIME",
    calories: 150,
    durationMin: 20,
    days: [0, 1, 2, 3, 4, 5, 6],
    createdDaysAgo: HISTORY_DAYS,
  },
  {
    key: "pushups",
    name: "Push-ups",
    type: "STRENGTH",
    calories: 60,
    sets: 3,
    reps: 15,
    days: [1, 2, 3, 4, 5],
    createdDaysAgo: HISTORY_DAYS,
  },
  {
    key: "rdl",
    name: "Single-arm dumbbell Romanian deadlift to overhead press complex (alternating sides)",
    type: "STRENGTH",
    calories: 180,
    sets: 3,
    reps: 10,
    weight: 25,
    days: [0, 6],
    createdDaysAgo: 18,
  },
  {
    key: "plank",
    name: "Plank",
    type: "TIME",
    calories: 15,
    durationMin: 3,
    days: [1, 3, 5, 0],
    createdDaysAgo: 10,
  },
  {
    key: "yoga",
    name: "Yoga flow",
    type: "TIME",
    calories: 180,
    durationMin: 45,
    days: [0, 1, 2, 3, 4, 5, 6],
    createdDaysAgo: 3,
  },
];

// Removed from the plan 12 days ago; its days were frozen into ExercisePlanDay
// first, and its ticks keep goalDate with exerciseGoalId nulled out.
const DELETED_GOAL = {
  name: "Swimming laps at the community aquatic centre (freestyle and backstroke)",
  type: "TIME" as const,
  calories: 400,
  durationMin: 40,
  days: [6],
  createdDaysAgo: HISTORY_DAYS,
  deletedDaysAgo: 12,
};

type ExtraSeed = {
  name: string;
  type: "TIME" | "STRENGTH";
  calories: number;
  durationMin?: number;
  sets?: number;
  reps?: number;
  weight?: number;
};

// Unplanned exercises that show up as "extra" on the chart.
const EXTRAS: readonly ExtraSeed[] = [
  { name: "Cycling to work", type: "TIME", calories: 260, durationMin: 35 },
  {
    name: "Pick-up basketball game with friends at the outdoor court downtown",
    type: "TIME",
    calories: 520,
    durationMin: 60,
  },
  {
    name: "Bench press",
    type: "STRENGTH",
    calories: 150,
    sets: 5,
    reps: 5,
    weight: 155,
  },
  {
    name: "Weighted pull-ups with neutral grip and slow eccentric lowering phase",
    type: "STRENGTH",
    calories: 120,
    sets: 4,
    reps: 6,
    weight: 20,
  },
  {
    name: "Bicep curls",
    type: "STRENGTH",
    calories: 70,
    sets: 3,
    reps: 12,
    weight: 30,
  },
  { name: "Hiking", type: "TIME", calories: 610, durationMin: 120 },
  { name: "Stretching", type: "TIME", calories: 30, durationMin: 10 },
];

type DayScenario =
  "all-done" | "all-missed" | "modified" | "extras-only" | "mixed";

// Fixed scenarios for the most recent week so the chart always shows each
// case; older days are mixed at random.
const SCENARIOS: Record<number, DayScenario> = {
  1: "all-done",
  2: "all-missed",
  3: "mixed",
  4: "extras-only",
  5: "modified",
  6: "all-done",
};

async function main() {
  const email = "demo@example.com";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Demo user already exists");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo User",
      emailVerified: new Date(),
      password: await hashPassword("password"),
      goals: {
        create: {
          calorieGoal: 2200,
          proteinGoal: 160,
          carbsGoal: 260,
          fatGoal: 75,
          saturatedFatGoal: 20,
          healthNotes:
            "Watching cholesterol; trying to keep saturated fat low.",
        },
      },
    },
  });

  // Anchored to now (not a fixed clock time) so entries are never in the future
  // in any timezone. Entries within a day are spaced by a few minutes only, so
  // they stay on the same calendar day as `now` for that offset.
  const now = new Date();
  const dayAt = (daysAgo: number, minutesAgo = 0) =>
    subMinutes(subDays(now, daysAgo), minutesAgo);
  const dateKey = (daysAgo: number) => format(dayAt(daysAgo), "yyyy-MM-dd");
  const weekdayOf = (daysAgo: number) => dayAt(daysAgo).getDay();

  // Saved items
  await prisma.savedFoodItem.createMany({
    data: [
      { ...FOODS.oatmeal, isPinned: true },
      { ...FOODS.yogurt, isPinned: true },
      FOODS.salad,
      FOODS.rice,
      FOODS.eggs,
      FOODS.shake,
      FOODS.salmon,
      FOODS.burrito,
    ].map((food: FoodSeed & { isPinned?: boolean }) => ({
      name: food.name,
      isPinned: food.isPinned ?? false,
      userId: user.id,
      calories: randomNutritionValue(food.calories),
      protein: randomNutritionValue(food.protein),
      carbs: randomNutritionValue(food.carbs),
      fat: randomNutritionValue(food.fat),
      saturatedFat: randomNutritionValue(food.saturatedFat),
    })),
  });

  await prisma.savedExerciseItem.createMany({
    data: [
      {
        name: "Morning run",
        type: "TIME",
        calories: 320,
        durationMin: 30,
        isPinned: true,
      },
      {
        name: "Evening walk",
        type: "TIME",
        calories: 150,
        durationMin: 20,
        isPinned: true,
      },
      {
        name: "Strength training",
        type: "STRENGTH",
        calories: 210,
        sets: 3,
        reps: 10,
        weight: 50,
      },
      ...EXTRAS,
    ].map((item) => ({ ...item, userId: user.id })),
  });

  // Food: three meals most days, random snacks, a skipped day and an over-goal day.
  const foodLogs: Prisma.FoodLogCreateManyInput[] = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    if (daysAgo === 9) continue; // Nothing logged
    let meals: FoodSeed[];
    if (daysAgo === 0) {
      meals = [FOODS.oatmeal, FOODS.yogurt];
    } else if (daysAgo === 7) {
      meals = [FOODS.croissant, FOODS.burrito, FOODS.pizza, FOODS.almonds];
    } else {
      meals = [pick(BREAKFASTS), pick(LUNCHES), pick(DINNERS)];
      if (chance(0.6)) meals.push(pick(SNACKS));
      if (chance(0.25)) meals.splice(1, 1); // Skipped lunch
    }
    meals.forEach((food, index) => {
      foodLogs.push({
        ...food,
        userId: user.id,
        loggedAt: dayAt(daysAgo, (meals.length - index) * 2),
        calories: randomNutritionValue(food.calories),
        protein: randomNutritionValue(food.protein),
        carbs: randomNutritionValue(food.carbs),
        fat: randomNutritionValue(food.fat),
        saturatedFat: randomNutritionValue(food.saturatedFat),
      });
    });
  }
  await prisma.foodLog.createMany({ data: foodLogs });

  // Exercise plan
  const goals = await Promise.all(
    GOALS.map(async ({ key, days, createdDaysAgo, ...goal }) => ({
      key,
      ...(await prisma.exerciseGoal.create({
        data: {
          ...goal,
          userId: user.id,
          daysMask: days.length === 7 ? EVERYDAY_MASK : daysToMask(days),
          createdAt: dayAt(createdDaysAgo, 30),
        },
      })),
    })),
  );

  // Freeze the plan for the days before the swim goal was deleted, as
  // freezePastPlanDays would have when it was removed. Later days derive from
  // the current goals.
  const deletedGoalPlan = {
    daysMask: daysToMask(DELETED_GOAL.days),
    createdAt: dayAt(DELETED_GOAL.createdDaysAgo, 30),
  };
  const planBeforeDeletion = [...goals, deletedGoalPlan];
  const frozenDays: Prisma.ExercisePlanDayCreateManyInput[] = [];
  for (
    let daysAgo = HISTORY_DAYS;
    daysAgo > DELETED_GOAL.deletedDaysAgo;
    daysAgo--
  ) {
    frozenDays.push({
      userId: user.id,
      date: dateKey(daysAgo),
      plannedCount: countPlannedOn(
        planBeforeDeletion,
        weekdayOf(daysAgo),
        endOfDay(dayAt(daysAgo)),
      ),
    });
  }
  await prisma.exercisePlanDay.createMany({ data: frozenDays });

  // Exercise logs
  const exerciseLogs: Prisma.ExerciseLogCreateManyInput[] = [];
  const logExtra = (daysAgo: number, extra: ExtraSeed, minutesAgo: number) =>
    exerciseLogs.push({
      ...extra,
      durationMin: extra.durationMin ?? 0,
      userId: user.id,
      loggedAt: dayAt(daysAgo, minutesAgo),
    });

  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 1; daysAgo--) {
    const scenario = SCENARIOS[daysAgo] ?? "mixed";
    const weekday = weekdayOf(daysAgo);
    const dayEnd = endOfDay(dayAt(daysAgo));
    const planned = goals.filter(
      (goal) => isActiveOn(goal.daysMask, weekday) && goal.createdAt <= dayEnd,
    );

    let minutesAgo = 20;
    for (const goal of planned) {
      const done =
        scenario === "all-done" ||
        scenario === "modified" ||
        (scenario === "mixed" && chance(0.65));
      if (!done) continue;

      // Sometimes the user did more or fewer sets/reps than planned.
      const modified =
        goal.type === "STRENGTH" &&
        (scenario === "modified" || (scenario === "mixed" && chance(0.3)));
      exerciseLogs.push({
        userId: user.id,
        exerciseGoalId: goal.id,
        goalDate: dateKey(daysAgo),
        name: goal.name,
        type: goal.type,
        calories: goal.calories,
        durationMin: goal.durationMin ?? 0,
        sets: modified ? (goal.sets ?? 3) + pick([-1, 1]) : goal.sets,
        reps: modified ? (goal.reps ?? 10) + pick([-2, 2, 4]) : goal.reps,
        weight: goal.weight,
        loggedAt: dayAt(daysAgo, minutesAgo--),
      });
    }

    const swimPlanned =
      daysAgo > DELETED_GOAL.deletedDaysAgo &&
      isActiveOn(deletedGoalPlan.daysMask, weekday);
    if (swimPlanned && scenario !== "all-missed" && chance(0.7)) {
      exerciseLogs.push({
        userId: user.id,
        name: DELETED_GOAL.name,
        type: DELETED_GOAL.type,
        calories: DELETED_GOAL.calories,
        durationMin: DELETED_GOAL.durationMin,
        goalDate: dateKey(daysAgo),
        loggedAt: dayAt(daysAgo, minutesAgo--),
      });
    }

    if (scenario === "extras-only") {
      logExtra(daysAgo, EXTRAS[1], minutesAgo--);
      logExtra(daysAgo, EXTRAS[6], minutesAgo--);
    } else if (scenario === "all-done") {
      logExtra(daysAgo, pick(EXTRAS), minutesAgo--);
    } else if (scenario === "mixed" && chance(0.4)) {
      logExtra(daysAgo, pick(EXTRAS), minutesAgo--);
      if (chance(0.3)) logExtra(daysAgo, pick(EXTRAS), minutesAgo--);
    }
  }

  // Today: tick roughly the first half of the plan, leave the rest pending,
  // plus one extra with a long name.
  const todaysGoals = goals.filter((goal) =>
    isActiveOn(goal.daysMask, weekdayOf(0)),
  );
  todaysGoals
    .slice(0, Math.ceil(todaysGoals.length / 2))
    .forEach((goal, index) => {
      exerciseLogs.push({
        userId: user.id,
        exerciseGoalId: goal.id,
        goalDate: dateKey(0),
        name: goal.name,
        type: goal.type,
        calories: goal.calories,
        durationMin: goal.durationMin ?? 0,
        sets: goal.sets,
        reps: goal.reps,
        weight: goal.weight,
        loggedAt: dayAt(0, 10 - index),
      });
    });
  logExtra(0, EXTRAS[3], 1);

  await prisma.exerciseLog.createMany({ data: exerciseLogs });

  // Weight: trending down with noise, a few gaps, two entries today.
  const weightLogs: Prisma.WeightLogCreateManyInput[] = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    if (daysAgo !== 0 && chance(0.3)) continue;
    const trend = 178 - ((HISTORY_DAYS - 1 - daysAgo) / HISTORY_DAYS) * 5;
    const noise = Math.round((random() - 0.5) * 16) / 10;
    weightLogs.push({
      userId: user.id,
      weight: Math.round((trend + noise) * 10) / 10,
      loggedAt: dayAt(daysAgo, 5),
    });
  }
  weightLogs.push({ userId: user.id, weight: 173, loggedAt: dayAt(0) });
  await prisma.weightLog.createMany({ data: weightLogs });

  console.log("Demo user created:", email);
  console.log(
    `  ${foodLogs.length} food logs, ${exerciseLogs.length} exercise logs, ` +
      `${goals.length} goals, ${frozenDays.length} frozen plan days, ` +
      `${weightLogs.length} weight logs`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
