import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, FileSearch, Search, Target, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Input, Skeleton } from '@/components/ui/primitives'
import { useDebounced } from '@/hooks/useData'
import { RESOURCE_TYPES } from '@/lib/constants'
import type { Resource } from '@/lib/types'
import { cn, pad2 } from '@/lib/utils'
import { api } from '@/services/api'
import NotFoundPage from './NotFoundPage'

export default function SubjectPage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const unit = params.get('unit') ? Number(params.get('unit')) : null
  const type = params.get('type') || ''
  const year = params.get('year') ? Number(params.get('year')) : null
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 200)

  const { data: subject, isLoading, error } = useQuery({ queryKey: ['subject', slug], queryFn: () => api.subject(slug) })
  const { data: results, isFetching } = useQuery({
    queryKey: ['subject-resources', slug, unit, dq],
    queryFn: () => api.search({ subject: slug, unit: unit ?? undefined, q: dq, limit: 100 }),
    enabled: !!subject,
    placeholderData: (p) => p,
  })

  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, String(v))))
    setParams(next, { replace: true })
  }

  const items = useMemo(() => results?.items ?? [], [results])
  const years = useMemo(() => [...new Set(items.map((r) => r.year))].sort((a, b) => b - a), [items])
  const typeCounts = useMemo(() => items.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.resource_type]: (acc[r.resource_type] ?? 0) + 1 }), {}), [items])
  const filtered = items.filter((r) => (!type || r.resource_type === type) && (!year || r.year === year))
  const grouped = useMemo(() => {
    const g: Record<string, Resource[]> = {}
    filtered.forEach((r) => (g[r.resource_type] ??= []).push(r))
    return RESOURCE_TYPES.filter((t) => g[t.value]).map((t) => ({ type: t, items: g[t.value] }))
  }, [filtered])

  if (error) return <NotFoundPage />
  const activeUnit = subject?.units.find((u) => u.number === unit)

  return (
    <Container>
      <Link to="/subjects" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Subjects
      </Link>

      {isLoading || !subject ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-4 w-96" />
        </div>
      ) : (
        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-muted">{subject.code}</span>
            <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">{subject.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">{subject.description}</p>
            <p className="mt-3 text-[13px] text-subtle tabular">
              {subject.resource_count} resources · {subject.units.length} units
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:w-[420px]">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search within ${subject.code}…`} className="pl-9" />
            </div>
            <Link to={`/exam?subject=${subject.slug}`} className={buttonVariants({ variant: 'secondary' })}>
              <Target /> Exam mode
            </Link>
          </div>
        </header>
      )}

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Units */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 hidden text-2xs font-medium tracking-wider text-subtle uppercase lg:block">Units</div>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
            <UnitButton active={unit === null} onClick={() => update({ unit: null })} number="All" title="All units" count={subject?.resource_count} />
            {subject?.units.map((u) => (
              <UnitButton key={u.id} active={unit === u.number} onClick={() => update({ unit: u.number })} number={pad2(u.number)} title={u.title} count={u.resource_count} />
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <AnimatePresence mode="wait">
            {activeUnit && (
              <motion.div key={activeUnit.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-5">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-subtle">{pad2(activeUnit.number)}</span>
                  <h2 className="text-lg font-semibold tracking-tight">{activeUnit.title}</h2>
                </div>
                {activeUnit.topics && <p className="mt-1 text-[13px] text-muted">{activeUnit.topics}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filters */}
          <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TypeTab active={!type} onClick={() => update({ type: null })} label="All" count={items.length} />
              {RESOURCE_TYPES.filter((t) => typeCounts[t.value]).map((t) => (
                <TypeTab key={t.value} active={type === t.value} onClick={() => update({ type: t.value })} label={t.short} count={typeCounts[t.value]} />
              ))}
            </div>
            {years.length > 1 && (
              <div className="flex items-center gap-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => update({ year: year === y ? null : y })}
                    className={cn(
                      'h-7 rounded-md border px-2 text-xs tabular transition-colors',
                      year === y ? 'border-accent/30 bg-accent-soft text-accent' : 'border-transparent text-muted hover:text-fg',
                    )}
                  >
                    {y}
                  </button>
                ))}
                {year && (
                  <button onClick={() => update({ year: null })} className="ml-1 text-subtle hover:text-fg" aria-label="Clear year">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {!results ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <ResourceCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title={dq ? `Nothing matches “${dq}”` : 'No resources here yet'}
              description={dq ? 'Try a broader term or another unit.' : 'Be the first to share notes or papers for this unit — it helps everyone in your batch.'}
              action={
                <Link to={`/upload?subject=${slug}${unit ? `&unit=${unit}` : ''}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                  <Upload /> Upload a document
                </Link>
              }
            />
          ) : (
            <div className={cn('space-y-10 transition-opacity', isFetching && 'opacity-60')}>
              {grouped.map(({ type: t, items: list }) => (
                <div key={t.value}>
                  <div className="mb-3 flex items-center gap-2">
                    <t.icon className="size-4 text-subtle" />
                    <h3 className="text-sm font-semibold">{t.label}</h3>
                    <span className="text-xs text-subtle tabular">{list.length}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((r, i) => (
                      <ResourceCard key={r.id} resource={{ ...r, recommended: false }} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Container>
  )
}

function UnitButton({ active, onClick, number, title, count }: { active: boolean; onClick: () => void; number: string; title: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors lg:w-full',
        active ? 'border-border-strong bg-surface shadow-xs' : 'border-transparent hover:bg-surface-2/70',
      )}
    >
      {active && <motion.span layoutId="unit-active" className="absolute top-2.5 bottom-2.5 left-0 hidden w-0.5 rounded-full bg-accent lg:block" />}
      <span className={cn('font-mono text-xs tabular', active ? 'text-accent' : 'text-subtle')}>{number}</span>
      <span className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', active ? 'text-fg' : 'text-muted group-hover:text-fg')}>{title}</span>
      {count !== undefined && <span className="hidden text-xs text-subtle tabular lg:inline">{count}</span>}
    </button>
  )
}

function TypeTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn('relative h-8 shrink-0 rounded-md px-2.5 text-[13px] font-medium transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg')}
    >
      {active && <motion.span layoutId="type-tab" className="absolute inset-0 rounded-md bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <span className="relative">
        {label} <span className="text-subtle tabular">{count}</span>
      </span>
    </button>
  )
}
