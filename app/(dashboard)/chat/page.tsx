import {getServerSession} from 'next-auth/next';
import {notFound, redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {isAiEnabled} from '@/lib/ai';
import {listThreads} from '@/lib/chat/view';
import {ChatPageClient} from '@/components/chat/chat-page-client';

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  if (!isAiEnabled()) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const [{thread}, threads] = await Promise.all([
    searchParams,
    listThreads(session.user.id),
  ]);

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold">Coach</h1>
        <p className="text-muted-foreground">
          Ask about your food, training and weight, answered from your own logs
        </p>
      </div>
      <ChatPageClient
        initialThreads={threads}
        initialThreadId={typeof thread === 'string' ? thread : null}
      />
    </div>
  );
}
