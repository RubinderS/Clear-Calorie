import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {isUniqueViolation} from '@/lib/data/errors';
import {
  deleteSavedFood,
  findSavedFoodByName,
  listSavedFood,
  upsertSavedFood,
} from '@/lib/data/saved-items';

const savedFoodSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    calories: z.number().finite().min(0),
    protein: z.number().finite().min(0).default(0),
    carbs: z.number().finite().min(0).default(0),
    fat: z.number().finite().min(0).default(0),
    saturatedFat: z.number().finite().min(0).default(0),
    isPinned: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.saturatedFat > data.fat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Saturated fat cannot exceed total fat',
        path: ['saturatedFat'],
      });
    }
  });

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const items = await listSavedFood(session.user.id);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      {error: 'Failed to fetch saved food items'},
      {status: 500},
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const body = await request.json();
    const parsed = savedFoodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, ...data} = parsed.data;

    const existing = await findSavedFoodByName(session.user.id, data.name);

    if (existing && existing.id !== id) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }

    const item = await upsertSavedFood(session.user.id, data);

    return NextResponse.json(item, {status: 201});
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }
    return NextResponse.json(
      {error: 'Failed to save food item'},
      {status: 500},
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const {searchParams} = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({error: 'Missing id'}, {status: 400});
    }

    await deleteSavedFood(session.user.id, id);

    return NextResponse.json({success: true});
  } catch {
    return NextResponse.json(
      {error: 'Failed to delete saved food item'},
      {status: 500},
    );
  }
}
