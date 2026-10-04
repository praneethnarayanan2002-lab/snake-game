import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, Star } from 'lucide-react'
import { useState } from 'react'
import { cn, formatCount } from '@/lib/utils'

/** Star toggle with a small particle burst on activation. */
export function StarToggle({
  starred,
  count,
  onToggle,
  size = 'md',
  showCount = true,
  className,
}: {
  starred: boolean
  count: number
  onToggle: () => void
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}) {
  const [burst, setBurst] = useState(0)
  const dims = { sm: 'h-7 px-2 text-xs gap-1', md: 'h-8 px-2.5 text-[13px] gap-1.5', lg: 'h-10 px-4 text-sm gap-2' }[size]
  const icon = size === 'lg' ? 'size-[18px]' : size === 'sm' ? 'size-3.5' : 'size-4'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!starred) setBurst((b) => b + 1)
        onToggle()
      }}
      aria-pressed={starred}
      aria-label={starred ? 'Unstar' : 'Star'}
      className={cn(
        'relative inline-flex items-center rounded-md border font-medium transition-colors duration-150',
        starred
          ? 'border-star/30 bg-star/10 text-star'
          : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
        dims,
        className,
      )}
    >
      <span className="relative grid place-items-center">
        <motion.span key={starred ? 'on' : 'off'} initial={{ scale: starred ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
          <Star className={cn(icon, starred && 'fill-current')} />
        </motion.span>
        <AnimatePresence>
          {burst > 0 && starred && (
            <motion.span key={burst} className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
              {Array.from({ length: 6 }).map((_, i) => {
                const a = (i / 6) * Math.PI * 2
                return (
                  <motion.span
                    key={i}
                    className="absolute top-1/2 left-1/2 size-1 rounded-full bg-star"
                    initial={{ x: '-50%', y: '-50%', scale: 1 }}
                    animate={{ x: `calc(-50% + ${Math.cos(a) * 14}px)`, y: `calc(-50% + ${Math.sin(a) * 14}px)`, scale: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                )
              })}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {showCount && (
        <span className="tabular overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              className="inline-block"
              initial={{ y: starred ? 10 : -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: starred ? -10 : 10, opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {formatCount(count)}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </button>
  )
}

export function BookmarkToggle({ bookmarked, onToggle, label = false, className }: { bookmarked: boolean; onToggle: () => void; label?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150',
        bookmarked ? 'border-accent/30 bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
        className,
      )}
    >
      <motion.span key={String(bookmarked)} initial={{ y: bookmarked ? -3 : 0 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
        <Bookmark className={cn('size-4', bookmarked && 'fill-current')} />
      </motion.span>
      {label && (bookmarked ? 'Saved' : 'Bookmark')}
    </button>
  )
}

/** Interactive 1–5 rating with hover preview. */
export function RatingInput({ value, onRate, size = 22 }: { value: number | null; onRate: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  const labels = ['Not useful', 'Meh', 'Decent', 'Very good', 'Exceptional']
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Rate this resource">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            whileTap={{ scale: 0.8 }}
            onMouseEnter={() => setHover(n)}
            onClick={() => onRate(n)}
            className="p-0.5"
          >
            <Star
              style={{ width: size, height: size }}
              className={cn('transition-colors duration-100', n <= shown ? 'fill-star text-star' : 'text-border-strong')}
            />
          </motion.button>
        ))}
      </div>
      <span className="min-w-20 text-xs text-muted">{shown ? labels[shown - 1] : 'Tap to rate'}</span>
    </div>
  )
}

export function RatingDisplay({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 tabular', className)}>
      <Star className="size-3.5 fill-star text-star" />
      <span className="font-medium text-fg">{value ? value.toFixed(1) : '—'}</span>
      {count !== undefined && <span className="text-subtle">({formatCount(count)})</span>}
    </span>
  )
}
