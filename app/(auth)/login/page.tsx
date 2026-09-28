import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {LoginForm} from './login-form';

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/dashboard');

  return <LoginForm />;
}
