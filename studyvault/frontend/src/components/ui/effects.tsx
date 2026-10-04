import { AnimatePresence, motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { useEffect, useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Card with a soft cursor-following highlight (21st.dev "spotlight card" pattern). */
export function SpotlightCard({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const x = useMotionValue(-200)
  const y = useMotionValue(-200)
  const bg = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, var(--accent-soft), transparent 70%)`
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    x.set(e.clientX - rect.left)
    y.set(e.clientY - rect.top)
  }
  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(-200)
        y.set(-200)
      }}
      className={cn('group relative overflow-hidden rounded-xl border border-border bg-surface shadow-xs', className)}
      {...props}
    >
      <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
      <div className="relative h-full">{children}</div>
    </div>
  )
}

/** Word-by-word blur-in reveal for headlines. */
export function RevealText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(' ').map((word, i) => (
        <motion.span
          key={i}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.5, delay: delay + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          {word + (i < text.split(' ').length - 1 ? ' ' : '')}
        </motion.span>
      ))}
    </span>
  )
}

/** Cycles through example strings with a vertical slide. */
export function RotatingText({ items, interval = 2600, className }: { items: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % items.length), interval)
    return () => clearInterval(t)
  }, [items.length, interval])
  return (
    <span className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={i}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="whitespace-nowrap"
        >
          {items[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute inset-0 bg-grid mask-fade-b" />
      <div className="absolute top-[-180px] left-1/2 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-accent/20 blur-[100px] dark:bg-accent/15" />
    </div>
  )
}
