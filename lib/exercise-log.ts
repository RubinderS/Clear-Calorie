import {z} from 'zod';
import {
  EXERCISE_LOG_INCLUDE,
  exerciseInputSchema,
  inputSets,
  isSameExerciseName,
  toExerciseFields,
  toSetRows,
} from '@/lib/exercise';
import {catalogIdFor} from '@/lib/exercise-catalog';
import {getPlannedExerciseGoals} from '@/lib/exercise-plan';
import {prisma} from '@/lib/prisma';

export const exerciseLogSchema = z
  .object({
    name: z.string().trim().min(1),
    calories: z.number().int().min(0),
  })
  .and(exerciseInputSchema);

export type ExerciseLogInput = z.infer<typeof exerciseLogSchema>;

/** Thrown when the exercise should be ticked off in today's plan instead. */
export class PlannedExerciseError extends Error {}

export async function createExerciseLog(
  userId: string,
  timeZone: string,
  input: ExerciseLogInput,
) {
  const {name, calories} = input;

  const planned = await getPlannedExerciseGoals(userId, timeZone);
  if (planned.some((goal) => isSameExerciseName(goal.name, name))) {
    throw new PlannedExerciseError(
      `"${name}" is in today's plan. Tick it off there instead.`,
    );
  }

  const sets = inputSets(input);
  const fields = toExerciseFields(sets);
  return prisma.exerciseLog.create({
    data: {
      name,
      catalogId: catalogIdFor(name),
      calories,
      ...fields,
      durationMin: fields.durationMin ?? 0,
      userId,
      exerciseSets: {create: toSetRows(sets)},
    },
    include: EXERCISE_LOG_INCLUDE,
  });
}
