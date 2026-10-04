import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.2)] hover:bg-accent-hover',
        secondary: 'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
        outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
        ghost: 'text-muted hover:text-fg hover:bg-surface-2',
        danger: 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15',
        inverted: 'bg-fg text-bg hover:opacity-90',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-9 rounded-md px-3.5 text-sm',
        lg: 'h-11 rounded-lg px-5 text-[15px]',
        icon: 'size-9 rounded-md',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
