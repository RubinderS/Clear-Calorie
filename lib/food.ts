import {z} from 'zod';
import * as foodLogs from '@/lib/data/food-logs';

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

export const foodSchema = z
  .object({
    ...nutritionFields,
    healthAlert: z
      .object({
        level: z.enum(['caution', 'avoid']),
        message: z.string().trim().min(1).max(200),
      })
      .nullish(),
  })
  .superRefine(refineSaturatedFat);

export type FoodInput = z.infer<typeof foodSchema>;

export function createFoodLog(userId: string, input: FoodInput) {
  const {healthAlert, ...food} = input;
  return foodLogs.createFoodLog({
    ...food,
    healthAlertLevel: healthAlert?.level ?? null,
    healthAlertMessage: healthAlert?.message ?? null,
    userId,
  });
}
