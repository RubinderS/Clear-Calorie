'use client';

import {Suspense, useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Button} from '@/components/ui/button';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailSkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email verification</CardTitle>
        <CardDescription>Verifying your email address...</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">Loading...</p>
      </CardContent>
    </Card>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<
    {status: 'success'} | {status: 'error'; error: string} | null
  >(null);

  const status = token ? (result?.status ?? 'loading') : 'error';
  const error = !token
    ? 'No verification token provided.'
    : result?.status === 'error'
      ? result.error
      : null;

  useEffect(() => {
    if (!token) return;

    fetch(`/api/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (response.redirected) {
          setResult({status: 'success'});
          return;
        }

        const data = await response.json().catch(() => ({}));
        setResult({
          status: 'error',
          error: data.error || 'Unable to verify email.',
        });
      })
      .catch(() => {
        setResult({
          status: 'error',
          error: 'Unable to verify email. Please try again later.',
        });
      });
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email verification</CardTitle>
        <CardDescription>
          {status === 'loading' && 'Verifying your email address...'}
          {status === 'success' && 'Your email has been verified.'}
          {status === 'error' && 'Verification failed'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' && (
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
        {status === 'error' && (
          <>
            <p className="text-sm text-red-500">{error}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
