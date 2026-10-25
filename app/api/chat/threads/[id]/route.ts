import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '@/lib/auth-options';
import {loadThreadItems} from '@/lib/chat/view';
import {deleteChatThread} from '@/lib/data/chat';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{id: string}>},
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const {id} = await params;
  const view = await loadThreadItems(session.user.id, id);
  if (!view) {
    return NextResponse.json({error: 'Chat not found'}, {status: 404});
  }
  return NextResponse.json(view);
}

export async function DELETE(
  _request: Request,
  {params}: {params: Promise<{id: string}>},
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const {id} = await params;
  if (!(await deleteChatThread(session.user.id, id))) {
    return NextResponse.json({error: 'Chat not found'}, {status: 404});
  }
  return new NextResponse(null, {status: 204});
}
