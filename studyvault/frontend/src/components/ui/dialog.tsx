import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  hideClose?: boolean
  /** Position near the top (command palette) instead of centred. */
  top?: boolean
}

export function Dialog({ open, onOpenChange, title, description, children, className, hideClose, top }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </DialogPrimitive.Overlay>
            <div className={cn('pointer-events-none fixed inset-0 z-50 flex justify-center p-3 sm:p-6', top ? 'items-start pt-[12vh]' : 'items-center')}>
              <DialogPrimitive.Content asChild forceMount {...(description ? {} : { 'aria-describedby': undefined })}>
                <motion.div
                  className={cn(
                    'pointer-events-auto relative w-full max-w-md overflow-hidden rounded-xl border border-border-strong bg-bg-elevated shadow-lg outline-none',
                    className,
                  )}
                  initial={{ opacity: 0, scale: 0.97, y: top ? -8 : 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: top ? -4 : 4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {title ? (
                    <div className="px-5 pt-5">
                      <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                      {description && <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">{description}</DialogPrimitive.Description>}
                    </div>
                  ) : (
                    <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
                  )}
                  {children}
                  {!hideClose && (
                    <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg">
                      <X className="size-4" />
                      <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                  )}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
