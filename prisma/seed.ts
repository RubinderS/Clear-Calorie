import {prisma} from '@/lib/prisma';
import {hashPassword} from '@/lib/auth';

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
          weightGoal: 170,
        },
      },
    },
  });

  await prisma.foodLog.createMany({
    data: [
      {
        userId: user.id,
        name: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 54,
        fat: 6,
      },
      {
        userId: user.id,
        name: 'Grilled chicken salad',
        calories: 450,
        protein: 45,
        carbs: 12,
        fat: 20,
      },
      {
        userId: user.id,
        name: 'Rice and vegetables',
        calories: 500,
        protein: 12,
        carbs: 80,
        fat: 14,
      },
    ],
  });

  await prisma.exerciseLog.createMany({
    data: [
      {userId: user.id, name: 'Morning run', calories: 320, durationMin: 30},
      {
        userId: user.id,
        name: 'Strength training',
        calories: 210,
        durationMin: 45,
      },
    ],
  });

  await prisma.weightLog.createMany({
    data: [
      {userId: user.id, weight: 175},
      {userId: user.id, weight: 174.2},
      {userId: user.id, weight: 173.5},
      {userId: user.id, weight: 173},
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
