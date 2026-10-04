import * as Popover from '@radix-ui/react-popover'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Info, Search, SearchX, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { ResourceRow } from '@/components/resource/ResourceCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { FilterMenu } from '@/components/ui/filter-menu'
import { Skeleton } from '@/components/ui/primitives'
import { pushRecentSearch, useSubjects } from '@/hooks/useData'
import { EXAM_TYPES, RESOURCE_TYPES, SORTS, TYPE_BY_VALUE, YEARS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

const PAGE = 20

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filters = {
    subject: params.get('subject') ?? '',
    unit: params.get('unit') ?? '',
    type: params.get('type') ?? '',
    year: params.get('year') ?? '',
    exam_type: params.get('exam_type') ?? '',
  }
  const sort = params.get('sort') ?? 'best'
  const [input, setInput] = useState(q)
  useEffect(() => {
    setInput(q)
  }, [q])
  const { data: subjects } = useSubjects()

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['search', q, filters, sort],
    queryFn: ({ pageParam }) =>
      api.search({
        q,
        subject: filters.subject,
        unit: filters.unit ? Number(filters.unit) : undefined,
        type: filters.type,
        year: filters.year ? Number(filters.year) : undefined,
        exam_type: filters.exam_type,
        sort,
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.limit < last.total ? last.offset + last.limit : undefined),
    placeholderData: (p) => p,
  })

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    pushRecentSearch(input)
    update({ q: input.trim() })
  }

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const first = data?.pages[0]
  const parsed = first?.parsed
  const total = first?.total ?? 0
  const activeSubject = subjects?.find((s) => s.slug === filters.subject)
  const unitOptions = useMemo(
    () => (activeSubject ? activeSubject.units.map((u) => ({ value: String(u.number), label: `Unit ${u.number} · ${u.title}` })) : [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Unit ${n}` }))),
    [activeSubject],
  )
  const anyFilter = Object.values(filters).some(Boolean)
  const understood = parsed
    ? [parsed.subject?.code, parsed.unit_number && `Unit ${parsed.unit_number}`, parsed.resource_type && TYPE_BY_VALUE[parsed.resource_type]?.label, parsed.year, parsed.exam_type?.replace('mid', 'Mid ')].filter(Boolean)
    : []

  return (
    <Container>
      <form onSubmit={submit} className="relative">
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search notes, papers, subjects, topics..."
          className="h-13 w-full rounded-xl border border-border-strong bg-surface pr-28 pl-12 text-[15px] shadow-sm transition-[border-color,box-shadow] outline-none placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/15"
          autoFocus={!q}
        />
        <Button type="submit" variant="primary" size="sm" className="absolute top-1/2 right-2.5 -translate-y-1/2">
          Search
        </Button>
      </form>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          <FilterMenu label="Subject" value={filters.subject} options={(subjects ?? []).map((s) => ({ value: s.slug, label: s.code }))} onChange={(v) => update({ subject: v, unit: '' })} />
          <FilterMenu label="Unit" value={filters.unit} options={unitOptions} onChange={(v) => update({ unit: v })} />
          <FilterMenu label="Type" value={filters.type} options={RESOURCE_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => update({ type: v })} />
          <FilterMenu label="Year" value={filters.year} options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} onChange={(v) => update({ year: v })} />
          <FilterMenu label="Exam" value={filters.exam_type} options={EXAM_TYPES} onChange={(v) => update({ exam_type: v })} />
          {anyFilter && (
            <button onClick={() => update({ subject: '', unit: '', type: '', year: '', exam_type: '' })} className="shrink-0 px-2 text-[13px] text-muted hover:text-fg">
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-[13px]">
          <span className="text-subtle">Sort</span>
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.value}
                onClick={() => update({ sort: s.value === 'best' ? '' : s.value })}
                className={cn('h-7 rounded-[5px] px-2 text-xs font-medium whitespace-nowrap transition-colors', sort === s.value ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <div className="flex flex-wrap items-center gap-1.5">
          {first ? (
            <span className="tabular">
              <span className="font-medium text-fg">{total}</span> {total === 1 ? 'result' : 'results'}
              {q && (
                <>
                  {' '}
                  for “<span className="text-fg">{q}</span>”
                </>
              )}
            </span>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
          {understood.length > 0 && (
            <>
              <span className="text-subtle">· understood as</span>
              {understood.map((c) => (
                <span key={String(c)} className="rounded-md border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                  {c}
                </span>
              ))}
            </>
          )}
        </div>
        <RankingInfo />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No resources found"
          description={
            <>
              Try fewer words, a subject code like <b>DBMS</b>, or something like <b>“os unit 3 pyq”</b>. Still nothing? You could be the first to upload it.
            </>
          }
          action={
            <Link to="/upload" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Upload /> Upload a document
            </Link>
          }
        />
      ) : (
        <div className={cn('space-y-2.5 transition-opacity duration-200', isFetching && !isFetchingNextPage && 'opacity-60')}>
          {items.map((r, i) => (
            <ResourceRow key={r.id} resource={r} index={i % PAGE} />
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </Container>
  )
}

function RankingInfo() {
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex items-center gap-1 text-xs text-subtle hover:text-fg">
        <Info className="size-3.5" /> How ranking works
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-80 rounded-lg border border-border-strong bg-bg-elevated p-4 text-[13px] shadow-lg">
          <p className="font-medium text-fg">Every result gets a weighted score</p>
          <div className="mt-3 space-y-2">
            {[
              ['Search relevance', 40, 'Title, tags, description and the text inside the file'],
              ['Subject / unit match', 20, 'Detected from your query, e.g. “DBMS unit 3”'],
              ['Resource type match', 15, '“pyq”, “mid”, “semester 2025”…'],
              ['Popularity', 15, 'Stars and views, with a nudge for fresh uploads'],
              ['Rating', 10, 'Average rating, weighted by how many people rated'],
            ].map(([label, w, hint]) => (
              <div key={label as string}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg">{label}</span>
                  <span className="text-subtle tabular">{w}%</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(w as number) * 2.5}%` }} />
                </div>
                <div className="mt-0.5 text-2xs text-subtle">{hint}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">The top result is marked ✦ Recommended.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
