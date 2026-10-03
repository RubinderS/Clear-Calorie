import * as React from 'react';
import {cn} from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({className, type, inputMode, ...props}, ref) => {
    // iOS shows a full keyboard for type="number"; inputMode brings up the number pad (with a decimal key when the step allows fractions).
    const allowsDecimal = props.step === 'any' || String(props.step ?? '').includes('.');
    const resolvedInputMode =
      inputMode ?? (type === 'number' ? (allowsDecimal ? 'decimal' : 'numeric') : undefined);

    return (
      <input
        type={type}
        inputMode={resolvedInputMode}
        className={cn(
          'flex h-11 w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export {Input};
