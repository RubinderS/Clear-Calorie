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
  const handleClick = () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      signOut({callbackUrl: '/'});
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={handleClick}
    >
      Sign out
    </Button>
  );
}
