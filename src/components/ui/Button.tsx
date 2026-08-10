import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    
    const variants = {
      primary: 'bg-brand-blue-500 text-white hover:bg-brand-blue-600 shadow-sm transition-all duration-300',
      secondary: 'bg-[var(--color-surface)] border border-brand-blue-500/50 text-brand-blue-400 hover:bg-brand-blue-500/10 hover:border-brand-blue-400 transition-all duration-300',
      outline: 'border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-all duration-300',
      ghost: 'hover:bg-[var(--color-surface-hover)] text-slate-400 hover:text-[var(--color-foreground)] transition-all duration-300',
      danger: 'bg-red-500/90 text-white hover:bg-red-600 shadow-sm transition-all duration-300',
    };

    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 py-2',
      lg: 'h-12 px-8 text-lg',
      icon: 'h-10 w-10',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        suppressHydrationWarning
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-gold-500)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
