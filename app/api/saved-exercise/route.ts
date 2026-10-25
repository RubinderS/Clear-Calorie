import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {exerciseInputSchema, inputSets, toPlanFields} from '@/lib/exercise';
import {catalogIdFor} from '@/lib/exercise-catalog';
import {isUniqueViolation} from '@/lib/data/errors';
import {
  deleteSavedExercise,
  findSavedExerciseByName,
  listSavedExercises,
  upsertSavedExercise,
} from '@/lib/data/saved-items';

const savedExerciseSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1),
    isPinned: z.boolean().default(false),
  })
  .and(exerciseInputSchema);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const items = await listSavedExercises(session.user.id);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      {error: 'Failed to fetch saved exercise items'},
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
    const parsed = savedExerciseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, name, isPinned} = parsed.data;
    const fields = toPlanFields(inputSets(parsed.data));
    const data = {
      name,
      catalogId: catalogIdFor(name),
      isPinned,
      ...fields,
      durationMin: fields.durationMin ?? 0,
    };

    const existing = await findSavedExerciseByName(session.user.id, data.name);

    if (existing && existing.id !== id) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }

    const item = await upsertSavedExercise(session.user.id, data);

    return NextResponse.json(item, {status: 201});
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }
    return NextResponse.json(
      {error: 'Failed to save exercise item'},
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

    await deleteSavedExercise(session.user.id, id);

    return NextResponse.json({success: true});
  } catch {
    return NextResponse.json(
      {error: 'Failed to delete saved exercise item'},
      {status: 500},
    );
  }
}
