import { motion } from 'framer-motion'
import { ArrowUpRight, Eye, Sparkles, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/primitives'
import { useResourceActions } from '@/hooks/useResourceActions'
import { TYPE_BY_VALUE } from '@/lib/constants'
import type { Resource } from '@/lib/types'
import { cn, formatCount } from '@/lib/utils'
import { BookmarkToggle, RatingDisplay, StarToggle } from './StarControls'

export function FileGlyph({ className, type, ext = 'pdf' }: { className?: string; type?: Resource['resource_type']; ext?: string }) {
  const Icon = type ? TYPE_BY_VALUE[type]?.icon : undefined
  return (
    <div className={cn('relative grid shrink-0 place-items-center rounded-lg border border-border bg-surface-2', className)}>
      {Icon && <Icon className="size-[45%] text-muted" strokeWidth={1.6} />}
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-[4px] border border-border bg-bg-elevated px-1 font-mono text-[9px] leading-[14px] font-semibold tracking-wide text-muted uppercase">
        {ext.slice(0, 4)}
      </span>
    </div>
  )
}

function Meta({ r }: { r: Resource }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
      <span className="font-medium text-fg/80">{r.subject.code}</span>
      <span className="text-subtle">·</span>
      <span>Unit {r.unit.number}</span>
      <span className="text-subtle">·</span>
      <span className="truncate">{r.resource_type_label}</span>
      <span className="text-subtle">·</span>
      <span className="tabular">{r.year}</span>
    </div>
  )
}

export function RecommendedBadge() {
  return (
    <Badge tone="accent" className="gap-1 font-semibold tracking-wide uppercase">
      <Sparkles /> Recommended
    </Badge>
  )
}

export function ResourceCard({ resource, index = 0, showWhy = false }: { resource: Resource; index?: number; showWhy?: boolean }) {
  const a = useResourceActions(resource)
  const r = resource
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 8) * 0.035, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <Link
        to={`/resources/${r.id}`}
        className={cn(
          'group relative flex h-full flex-col rounded-xl border bg-surface p-4 shadow-xs transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md',
          r.recommended ? 'border-accent/35 ring-1 ring-accent/10' : 'border-border',
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <FileGlyph type={r.resource_type} ext={r.file_ext} className="size-10" />
          <div className="flex items-center gap-1.5">
            {r.recommended && <RecommendedBadge />}
            <StarToggle starred={a.starred} count={a.counts.star_count} onToggle={a.toggleStar} size="sm" />
          </div>
        </div>
        <h3 className="line-clamp-2 text-[14px] leading-snug font-semibold tracking-[-0.01em] text-fg">{r.title}</h3>
        <div className="mt-1.5">
          <Meta r={r} />
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3 text-xs text-muted">
            <RatingDisplay value={a.counts.average_rating} count={a.counts.rating_count} />
            <span className="inline-flex items-center gap-1 tabular">
              <Star className="size-3.5" /> {formatCount(a.counts.star_count)}
            </span>
            <span className="inline-flex items-center gap-1 tabular">
              <Eye className="size-3.5" /> {formatCount(a.counts.view_count)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <Avatar name={r.uploader.full_name} size={20} />
              <span className="truncate">{r.uploader.username}</span>
            </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-fg">
              Open
              <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
          {showWhy && r.score && <ScoreBar score={r.score} />}
        </div>
      </Link>
    </motion.div>
  )
}

/** Wide variant used in search results. */
export function ResourceRow({ resource, index = 0 }: { resource: Resource; index?: number }) {
  const a = useResourceActions(resource)
  const r = resource
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/resources/${r.id}`}
        className={cn(
          'group relative flex gap-4 rounded-xl border bg-surface p-4 shadow-xs transition-[border-color,box-shadow,background-color] duration-200 hover:border-border-strong hover:shadow-md',
          r.recommended ? 'border-accent/40 bg-gradient-to-b from-accent-soft to-surface to-60%' : 'border-border',
        )}
      >
        <FileGlyph type={r.resource_type} ext={r.file_ext} className="hidden size-14 sm:grid" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {r.recommended && <RecommendedBadge />}
            <Badge>{r.resource_type_label}</Badge>
            {r.exam_type_label && <Badge tone="outline">{r.exam_type_label}</Badge>}
          </div>
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg group-hover:text-fg">{r.title}</h3>
          <div className="mt-1">
            <Meta r={r} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <RatingDisplay value={a.counts.average_rating} count={a.counts.rating_count} />
            <span className="inline-flex items-center gap-1 tabular">
              <Star className="size-3.5" /> {formatCount(a.counts.star_count)} stars
            </span>
            <span className="inline-flex items-center gap-1 tabular">
              <Eye className="size-3.5" /> {formatCount(a.counts.view_count)} views
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={r.uploader.full_name} size={16} /> {r.uploader.username}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookmarkToggle bookmarked={a.bookmarked} onToggle={a.toggleBookmark} className="hidden sm:inline-flex" />
            <StarToggle starred={a.starred} count={a.counts.star_count} onToggle={a.toggleStar} />
          </div>
          <span className="hidden items-center gap-1 rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-bg transition-opacity group-hover:opacity-90 sm:inline-flex">
            Open <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

const SCORE_PARTS: { key: keyof NonNullable<Resource['score']>; label: string; weight: number }[] = [
  { key: 'relevance', label: 'Relevance', weight: 0.4 },
  { key: 'subject_unit', label: 'Subject/unit', weight: 0.2 },
  { key: 'resource_type', label: 'Type', weight: 0.15 },
  { key: 'popularity', label: 'Popularity', weight: 0.15 },
  { key: 'rating', label: 'Rating', weight: 0.1 },
]

export function ScoreBar({ score }: { score: NonNullable<Resource['score']> }) {
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        {SCORE_PARTS.map((p, i) => (
          <div
            key={p.key}
            title={`${p.label}: ${Math.round(score[p.key] * 100)}%`}
            className="h-full bg-accent"
            style={{ width: `${score[p.key] * p.weight * 100}%`, opacity: 1 - i * 0.16 }}
          />
        ))}
      </div>
    </div>
  )
}

export function ResourceCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex justify-between">
        <div className="size-10 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-7 w-14 animate-pulse rounded-md bg-surface-2" />
      </div>
      <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-px bg-border" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-surface-2" />
    </div>
  )
}
