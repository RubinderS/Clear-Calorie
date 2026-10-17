import * as React from 'react';
import {ChevronDown} from 'lucide-react';
import {cn} from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Classes for the wrapper, e.g. a width. */
  wrapperClassName?: string;
};

/**
 * Native select styled like Input. The native arrow ignores padding and sits
 * against the border, so it's hidden and drawn here with room on the right.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({className, wrapperClassName, children, ...props}, ref) => (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'h-11 w-full appearance-none truncate rounded-xl border border-input bg-background/60 pl-3 pr-9 text-sm shadow-sm transition-all focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export {Select};
