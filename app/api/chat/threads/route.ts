import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '@/lib/auth-options';
import {isAiEnabled} from '@/lib/ai';
import {listThreads} from '@/lib/chat/view';

export async function GET() {
  if (!isAiEnabled()) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  return NextResponse.json(await listThreads(session.user.id));
}
