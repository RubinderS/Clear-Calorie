import {z} from 'zod';
import {prisma} from '@/lib/prisma';

export const weightSchema = z.object({
  weight: z.number().positive(),
});

export type WeightInput = z.infer<typeof weightSchema>;

export function createWeightLog(userId: string, input: WeightInput) {
  return prisma.weightLog.create({
    data: {weight: input.weight, userId},
  });
}
