import {randomInt} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {hashPassword} from '@/lib/auth';
import {subDays, format} from 'date-fns';
import {Decimal} from '@/lib/decimal';
import {EVERYDAY_MASK, daysToMask, isActiveOn} from '@/lib/exercise';

function randomNutritionValue(value: number) {
  if (value === 0) return value;
  const decimalPlaces = randomInt(0, 3);
  if (decimalPlaces === 0) return value;

  const divisor = new Decimal(10).pow(decimalPlaces);
  const fraction = new Decimal(randomInt(1, divisor.toNumber())).div(divisor);
  return new Decimal(value).plus(fraction).toNumber();
}

async function main() {
  const email = 'demo@example.com';
  const existing = await prisma.user.findUnique({where: {email}});

  if (existing) {
    console.log('Demo user already exists');
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Demo User',
      emailVerified: new Date(),
      password: await hashPassword('password'),
      goals: {
        create: {
          calorieGoal: 2200,
          proteinGoal: 160,
          carbsGoal: 260,
          fatGoal: 75,
          saturatedFatGoal: 20,
          weightGoal: 170,
        },
      },
    },
  });

  // Anchored to now (not a fixed clock time) so entries are never in the future in any timezone.
  const today = new Date();
  const yesterday = subDays(today, 1);
  const twoDaysAgo = subDays(today, 2);

  await prisma.savedFoodItem.createMany({
    data: [
      {
        userId: user.id,
        name: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 54,
        fat: 6,
        saturatedFat: 1,
        isPinned: true,
      },
      {
        userId: user.id,
        name: 'Grilled chicken salad',
        calories: 450,
        protein: 45,
        carbs: 12,
        fat: 20,
        saturatedFat: 4,
      },
      {
        userId: user.id,
        name: 'Rice and vegetables',
        calories: 500,
        protein: 12,
        carbs: 80,
        fat: 14,
        saturatedFat: 2,
      },
      {
        userId: user.id,
        name: 'Greek yogurt',
        calories: 150,
        protein: 15,
        carbs: 10,
        fat: 0,
        saturatedFat: 0,
        isPinned: true,
      },
    ].map((food) => ({
      ...food,
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
        userId: user.id,
        name: 'Morning run',
        calories: 320,
        durationMin: 30,
        isPinned: true,
      },
      {
        userId: user.id,
        name: 'Strength training',
        type: 'STRENGTH',
        calories: 210,
        sets: 3,
        reps: 10,
        weight: 50,
      },
      {
        userId: user.id,
        name: 'Evening walk',
        calories: 150,
        durationMin: 20,
        isPinned: true,
      },
    ],
  });

  await prisma.foodLog.createMany({
    data: [
      // Today
      {
        userId: user.id,
        name: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 54,
        fat: 6,
        saturatedFat: 1,
        loggedAt: today,
      },
      {
        userId: user.id,
        name: 'Greek yogurt',
        calories: 150,
        protein: 15,
        carbs: 10,
        fat: 0,
        saturatedFat: 0,
        loggedAt: today,
      },
      // Yesterday
      {
        userId: user.id,
        name: 'Grilled chicken salad',
        calories: 450,
        protein: 45,
        carbs: 12,
        fat: 20,
        saturatedFat: 4,
        loggedAt: yesterday,
      },
      {
        userId: user.id,
        name: 'Rice and vegetables',
        calories: 500,
        protein: 12,
        carbs: 80,
        fat: 14,
        saturatedFat: 2,
        loggedAt: yesterday,
      },
      // Two days ago
      {
        userId: user.id,
        name: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 54,
        fat: 6,
        saturatedFat: 1,
        loggedAt: twoDaysAgo,
      },
      {
        userId: user.id,
        name: 'Grilled chicken salad',
        calories: 450,
        protein: 45,
        carbs: 12,
        fat: 20,
        saturatedFat: 4,
        loggedAt: twoDaysAgo,
      },
    ].map((food) => ({
      ...food,
      calories: randomNutritionValue(food.calories),
      protein: randomNutritionValue(food.protein),
      carbs: randomNutritionValue(food.carbs),
      fat: randomNutritionValue(food.fat),
      saturatedFat: randomNutritionValue(food.saturatedFat),
    })),
  });

  // Backdated so the weekly exercise chart has a plan for past days.
  const planStart = subDays(today, 14);
  const morningRun = await prisma.exerciseGoal.create({
    data: {
      userId: user.id,
      name: 'Morning run',
      type: 'TIME',
      calories: 320,
      durationMin: 30,
      daysMask: daysToMask([1, 3, 5]),
      createdAt: planStart,
    },
  });

  const morningRunToday = isActiveOn(morningRun.daysMask, today.getDay());

  await prisma.exerciseLog.createMany({
    data: [
      // Today
      {
        userId: user.id,
        name: 'Morning run',
        calories: 320,
        durationMin: 30,
        loggedAt: today,
        exerciseGoalId: morningRunToday ? morningRun.id : null,
        goalDate: morningRunToday ? format(today, 'yyyy-MM-dd') : null,
      },
      // Yesterday
      {
        userId: user.id,
        name: 'Strength training',
        type: 'STRENGTH',
        calories: 210,
        sets: 3,
        reps: 10,
        weight: 50,
        loggedAt: yesterday,
      },
      // Two days ago
      {
        userId: user.id,
        name: 'Evening walk',
        calories: 150,
        durationMin: 20,
        loggedAt: twoDaysAgo,
      },
    ],
  });

  await prisma.exerciseGoal.createMany({
    data: [
      {
        userId: user.id,
        name: 'Strength training',
        type: 'STRENGTH',
        calories: 210,
        sets: 3,
        reps: 10,
        daysMask: daysToMask([2, 4]),
        createdAt: planStart,
      },
      {
        userId: user.id,
        name: 'Evening walk',
        type: 'TIME',
        calories: 150,
        durationMin: 20,
        daysMask: EVERYDAY_MASK,
        createdAt: planStart,
      },
    ],
  });

  await prisma.weightLog.createMany({
    data: [
      {userId: user.id, weight: 175, loggedAt: twoDaysAgo},
      {userId: user.id, weight: 174.2, loggedAt: yesterday},
      {userId: user.id, weight: 173.5, loggedAt: today},
      {userId: user.id, weight: 173, loggedAt: today},
    ],
  });

  console.log('Demo user created:', email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
