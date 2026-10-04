import { animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn, formatCount } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong px-6 py-14 text-center',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60" />
      <div className="relative mb-4 grid size-11 place-items-center rounded-xl border border-border bg-surface shadow-sm">
        <Icon className="size-5 text-muted" />
      </div>
      <h3 className="relative text-[15px] font-semibold tracking-tight">{title}</h3>
      {description && <p className="relative mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </motion.div>
  )
}

/** Counts up once when scrolled into view. */
export function AnimatedNumber({ value, compact = false, className }: { value: number; compact?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => (compact ? formatCount(Math.round(v)) : Math.round(v).toLocaleString()))
  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [inView, value, mv])
  return <motion.span ref={ref} className={cn('tabular', className)}>{text}</motion.span>
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}
