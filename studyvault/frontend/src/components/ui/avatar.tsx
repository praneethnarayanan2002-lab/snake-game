import { cn } from '@/lib/utils'

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full border border-border bg-gradient-to-b from-surface-3 to-surface-2 font-semibold text-muted select-none',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.38) }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  )
}
