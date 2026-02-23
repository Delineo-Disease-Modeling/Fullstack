import { forwardRef } from 'react';

const variants = {
  'default':
    'bg-(--color-bg-dark) text-(--color-text-light) border-(--color-text-light) hover:bg-(--color-gray-dark)',
  'primary':
    'bg-(--color-primary-blue) text-white hover:brightness-90 border-(--color-primary-blue)',
  'secondary' :
    'bg-(--color-bg-ivory) text-(--color-text-main) hover:brightness-90 border-(--color-primary-blue)',
  'neutral':
    'bg-gray-200 text-gray-800 hover:bg-gray-300 border-border-(--color-accent-red)',
  'destructive':
    'bg-(--color-accent-red) text-(--color-text-light) border-(--color-text-light) hover:bg-(--color-accent-red-light)',
  'dark-destructive':
    'bg-(--color-bg-dark) text-(--color-accent-red) border-(--color-accent-red) hover:bg-(--color-accent-red) hover:text-(--color-bg-dark)',
} as const;

type ButtonVariant = keyof typeof variants;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`px-4 py-1.5 border-2 text-sm rounded-md cursor-pointer transition-all duration-200 ease-in-out active:translate-y-px disabled:opacity-50 disabled:pointer-events-none ${variants[variant]}${className ? ` ${className}` : ''}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export default Button;
