import { forwardRef } from 'react';
import '@/styles/slider.css';

const variants = {
  'default': 'ui-slider--default',
  'dark': 'ui-slider--dark',
} as const;

type SliderVariant = keyof typeof variants;

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: SliderVariant;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ variant = 'default', className, type: _type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        className={`block appearance-none outline-0 h-1.25 rounded-[5px] cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${variants[variant]}${className ? ` ${className}` : ''}`}
        {...props}
      />
    );
  }
);

Slider.displayName = 'Slider';

export default Slider;
