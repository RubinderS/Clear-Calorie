'use client';

import {signOut} from 'next-auth/react';
import {Button} from '@/components/ui/button';

interface SignOutButtonProps {
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}

export function SignOutButton({
  className,
  variant = 'ghost',
}: SignOutButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={() => signOut({callbackUrl: '/'})}
    >
      Sign out
    </Button>
  );
}
