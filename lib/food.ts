import {z} from 'zod';
import * as foodLogs from '@/lib/data/food-logs';
import {saveAliases} from '@/lib/data/foods';
import {normalisePhrase} from '@/lib/food-match';

export const nutritionFields = {
  name: z.string().trim().min(1),
  calories: z.number().finite().min(0),
  protein: z.number().finite().min(0).default(0),
  carbs: z.number().finite().min(0).default(0),
  fat: z.number().finite().min(0).default(0),
  saturatedFat: z.number().finite().min(0).default(0),
};

export function refineSaturatedFat(
  data: {fat: number; saturatedFat: number},
  ctx: z.RefinementCtx,
) {
  if (data.saturatedFat > data.fat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Saturated fat cannot exceed total fat',
      path: ['saturatedFat'],
    });
  }
}

/** The database food each estimated item was logged as, to remember for next time. */
const foodMatchSchema = z.object({
  phrase: z.string().trim().min(1).max(100),
  foodId: z.string().regex(/^\d{8}$/),
});

export const foodSchema = z
  .object({
    ...nutritionFields,
    healthAlert: z
      .object({
        level: z.enum(['caution', 'avoid']),
        message: z.string().trim().min(1).max(200),
      })
      .nullish(),
    matches: z.array(foodMatchSchema).max(20).optional(),
  })
  .superRefine(refineSaturatedFat);

export type FoodInput = z.infer<typeof foodSchema>;

/** Logs food, now unless `loggedAt` is given. */
export async function createFoodLog(userId: string, input: FoodInput, loggedAt?: Date) {
  const {healthAlert, matches, ...food} = input;
  const entry = await foodLogs.createFoodLog({
    ...food,
    healthAlertLevel: healthAlert?.level ?? null,
    healthAlertMessage: healthAlert?.message ?? null,
    userId,
    loggedAt,
  });

  if (matches?.length) {
    // Remembering a match is a bonus; it never fails the log.
    await saveAliases(
      userId,
      matches.map(({phrase, foodId}) => ({phrase: normalisePhrase(phrase), foodId})),
    ).catch((error) => console.error('Saving food aliases failed:', error));
  }
  return entry;
}
