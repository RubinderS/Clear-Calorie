import {z} from 'zod';
import * as weightLogs from '@/lib/data/weight-logs';

export const weightSchema = z.object({
  weight: z.number().positive(),
});

export type WeightInput = z.infer<typeof weightSchema>;

export function createWeightLog(userId: string, input: WeightInput) {
  return weightLogs.createWeightLog(userId, input.weight);
}
