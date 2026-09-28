import {NextResponse} from 'next/server';
import {z} from 'zod';
import {verifyEmail} from '@/lib/email';

const tokenSchema = z.object({
  token: z.string().min(1),
});

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const parsed = tokenSchema.safeParse({token: searchParams.get('token')});

  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid token'}, {status: 400});
  }

  const result = await verifyEmail(parsed.data.token);

  if (!result.success) {
    return NextResponse.json({error: result.error}, {status: 400});
  }

  return NextResponse.redirect(new URL('/login?verified=1', request.url));
}
