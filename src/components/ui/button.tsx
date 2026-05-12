import { forwardRef } from 'react';

const variants = {
  'default':
    'bg-(--color-bg-dark) text-(--color-text-light) border-(--color-bg-dark) hover:bg-(--color-bg-dark-soft) hover:border-(--color-bg-dark-soft) shadow-sm',
  'primary':
    'bg-(--color-primary-blue) text-white hover:brightness-110 border-(--color-primary-blue) shadow-sm hover:shadow-md',
  'secondary' :
    'bg-white text-(--color-text-main) hover:bg-(--color-bg-surface) border-(--color-border-subtle) shadow-sm',
  'neutral':
    'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200',
  'destructive':
    'bg-(--color-accent-red) text-white border-(--color-accent-red) hover:bg-(--color-accent-red-light) hover:border-(--color-accent-red-light) shadow-sm',
  'dark-destructive':
    'bg-(--color-bg-dark) text-(--color-accent-red) border-(--color-accent-red) hover:bg-(--color-accent-red) hover:text-white',
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
        className={`px-4 py-2 border text-sm font-medium rounded-lg cursor-pointer transition-all duration-200 ease-in-out active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-blue-soft) focus-visible:ring-offset-2 ${variants[variant]}${className ? ` ${className}` : ''}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export default Button;
