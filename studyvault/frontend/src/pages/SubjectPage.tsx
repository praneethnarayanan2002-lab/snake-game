import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BookMarked, ExternalLink, FileSearch, FlaskConical, GraduationCap, ListChecks, Search, Target, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Badge, Input, Skeleton } from '@/components/ui/primitives'
import { semLabel, semLong, useAcademic } from '@/hooks/useAcademic'
import { useDebounced } from '@/hooks/useData'
import { RESOURCE_TYPES } from '@/lib/constants'
import type { Resource, Subject } from '@/lib/types'
import { cn, pad2 } from '@/lib/utils'
import { api } from '@/services/api'
import NotFoundPage from './NotFoundPage'

export default function SubjectPage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const unit = params.get('unit') ? Number(params.get('unit')) : null
  const type = params.get('type') || ''
  const year = params.get('year') ? Number(params.get('year')) : null
  const tab = params.get('tab') === 'syllabus' ? 'syllabus' : 'resources'
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

  const { academic } = useAcademic()
  if (error) return <NotFoundPage />
  // Year/semester differ by branch (e.g. ML is III-I for CSE, III-II for CSD); show the viewer's own.
  const mine = subject?.offerings.find((o) => o.branch_code === academic.branch)
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-muted">{subject.code}</span>
              {subject.course_code && <span className="font-mono text-xs text-subtle">{subject.course_code}</span>}
              {subject.regulation && (
                <Badge tone="accent">
                  <GraduationCap /> GRIET {subject.regulation} syllabus
                </Badge>
              )}
              {mine?.year ? (
                <Badge>
                  {semLong(mine.year, mine.semester)} · {mine.branch_code}
                </Badge>
              ) : (
                subject.year && <Badge>{semLong(subject.year, subject.semester)}</Badge>
              )}
              {(mine ?? subject.offerings[0])?.elective && <Badge>{(mine ?? subject.offerings[0])!.elective}</Badge>}
              {subject.kind !== 'theory' && (
                <Badge>
                  {subject.kind === 'lab' && <FlaskConical />} {subject.kind === 'lab' ? 'Lab' : 'Project'}
                </Badge>
              )}
              {subject.ltpc && <span className="font-mono text-[11px] text-subtle">L/T/P/C {subject.ltpc}</span>}
            </div>
            <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">{subject.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">{subject.description}</p>
            <p className="mt-3 text-[13px] text-subtle tabular">
              {subject.resource_count} resources · {subject.units.length} units
              {subject.offerings.length > 0 && (
                <>
                  {' · '}
                  <span title={subject.offerings.map((o) => `${o.branch_name}${o.elective ? ` (${o.elective})` : ''}`).join('\n')}>
                    {subject.offerings.length > 6 ? `${subject.offerings.length} branches` : subject.offerings.map((o) => o.branch_code).join(', ')}
                  </span>
                </>
              )}
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

      {subject && (
        <div className="mb-6 flex gap-1 border-b border-border">
          {(['resources', 'syllabus'] as const).map((t) => (
            <button
              key={t}
              onClick={() => update({ tab: t === 'resources' ? null : t })}
              className={cn('relative h-9 px-3 text-[13px] font-medium capitalize transition-colors', tab === t ? 'text-fg' : 'text-muted hover:text-fg')}
            >
              {t === 'resources' ? `Resources · ${subject.resource_count}` : 'Syllabus'}
              {tab === t && <motion.span layoutId="subject-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}

      {subject && tab === 'syllabus' ? (
        <Syllabus subject={subject} />
      ) : (
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
      )}
    </Container>
  )
}

function Syllabus({ subject: s }: { subject: Subject }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-8">
        {s.outcomes.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4 text-subtle" /> Course outcomes
            </h2>
            <ol className="space-y-1.5">
              {s.outcomes.map((o, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-muted">
                  <span className="font-mono text-xs text-subtle">CO{i + 1}</span>
                  <span>{o}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {s.kind === 'theory' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold">Units</h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface">
              {s.units.map((u) => (
                <div key={u.id} className="p-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-accent">UNIT {pad2(u.number)}</span>
                    <h3 className="text-[14px] font-semibold tracking-tight">{u.title}</h3>
                    <Link to={`?unit=${u.number}`} className="ml-auto shrink-0 text-xs text-muted hover:text-fg">
                      {u.resource_count} resources →
                    </Link>
                  </div>
                  {u.topics && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{u.topics}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
        {s.lab_tasks && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="size-4 text-subtle" /> {s.kind === 'project' ? 'Project work' : 'Lab experiments'}
            </h2>
            <div className="rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed whitespace-pre-line text-muted">{s.lab_tasks}</div>
          </section>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {s.books.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BookMarked className="size-4 text-subtle" /> Textbooks & references
            </h2>
            <ol className="list-decimal space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-muted">
              {s.books.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
          </div>
        )}
        {s.offerings.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">Offered to</h2>
            <ul className="space-y-1 text-[12.5px] text-muted">
              {s.offerings.map((o) => (
                <li key={o.branch_code} className="flex gap-2">
                  <span className="w-10 shrink-0 font-mono text-[11px] font-semibold text-subtle">{o.branch_code}</span>
                  <span className="min-w-0 flex-1 truncate">{o.branch_name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-subtle">{o.elective ?? semLabel(o.year, o.semester)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.source_url && (
          <a href={s.source_url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}>
            <ExternalLink /> Official {s.regulation} syllabus PDF
          </a>
        )}
        <p className="text-2xs leading-relaxed text-subtle">Parsed from GRIET's published syllabus book. If something looks off, the official PDF is the source of truth.</p>
      </aside>
    </div>
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
