import { BookX, ExternalLink, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { SubjectCard } from '@/components/resource/SubjectCard'
import { EmptyState } from '@/components/ui/feedback'
import { FilterMenu } from '@/components/ui/filter-menu'
import { Input, PageHeader, Skeleton } from '@/components/ui/primitives'
import { ROMAN, regulationFor, semLabel, useAcademic, useMeta, useSubjectList } from '@/hooks/useAcademic'
import { useDebounced } from '@/hooks/useData'
import type { SubjectListItem } from '@/lib/types'
import { cn } from '@/lib/utils'

// Branches whose programme only appears in GRIET's GR22 book (no GR24/GR25 intake).
const GR22_ONLY_BRANCHES = new Set(['IT', 'CSIT', 'CSAI'])
const SEMS = ['all', '1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']

export default function SubjectsPage() {
  const { academic } = useAcademic()
  const { data: meta } = useMeta()
  const [params, setParams] = useSearchParams()
  const branch = params.get('branch') ?? academic.branch
  const sem = params.get('sem') ?? `${academic.year}-${academic.semester}`
  const kind = params.get('kind') ?? ''
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 200)
  const [year, semester] = sem === 'all' || dq ? [undefined, undefined] : sem.split('-').map(Number)

  const { data, isLoading } = useSubjectList({ branch, year, semester, kind: kind || undefined, q: dq || undefined, limit: 500 })
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
  }

  const groups = useMemo(() => {
    const g = new Map<string, SubjectListItem[]>()
    for (const s of data ?? []) {
      const key = s.elective ? `${s.year ?? 0}-z-${s.elective}` : `${s.year ?? 0}-${s.semester ?? 0}`
      g.set(key, [...(g.get(key) ?? []), s])
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [data])
  const branchName = meta?.branches.find((b) => b.code === branch)?.name

  return (
    <Container>
      <PageHeader
        eyebrow="GRIET · B.Tech curriculum"
        title="Subjects"
        description={
          <>
            Every course {branchName ? `${branchName} students` : 'GRIET students'} are studying this academic year, from the official syllabus books — GR25 for I &amp; II year,
            GR24 for III year, GR22 for IV year. Units, outcomes and textbooks included.{' '}
            <a href="https://www.griet.ac.in/syllabus.php" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Source <ExternalLink className="size-3" />
            </a>
          </>
        }
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu label="Branch" value={branch} options={(meta?.branches ?? []).map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` }))} onChange={(v) => v && set({ branch: v })} />
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            {[['', 'All'], ['theory', 'Theory'], ['lab', 'Labs']].map(([v, l]) => (
              <button key={v} onClick={() => set({ kind: v })} className={cn('h-7 rounded-[5px] px-2.5 text-xs font-medium', kind === v ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all GRIET courses…" className="h-9 pl-9" />
          </div>
        </div>
        {!dq && (
          <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {SEMS.map((s) => {
              const [y, sm] = s.split('-').map(Number)
              return (
                <button
                  key={s}
                  onClick={() => set({ sem: s })}
                  className={cn('h-8 shrink-0 rounded-md border px-3 font-mono text-xs transition-colors', sem === s ? 'border-accent/40 bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-fg')}
                >
                  {s === 'all' ? 'All years' : semLabel(y, sm)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={BookX} title="No courses here" description={
            year && !GR22_ONLY_BRANCHES.has(branch)
              ? `GRIET's current ${regulationFor(year)} syllabus has no ${branch} courses for this semester — try another semester or branch.`
              : `${branch} only appears in the GR22 syllabus book, so GRIET lists its courses for IV year only.`
          } />
      ) : (
        <div className="space-y-10">
          {groups.map(([key, list]) => {
            const [y, s, elective] = [list[0].year, list[0].semester, list[0].elective]
            return (
              <section key={key}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">
                    {elective ? `${elective}` : y ? `${ROMAN[y]} Year${s ? ` · ${ROMAN[s]} Semester` : ''}` : 'Other'}
                    {elective && y ? <span className="font-normal text-muted"> · {ROMAN[y]} Year</span> : null}
                  </h2>
                  {list[0].regulation && <span className="font-mono text-2xs text-subtle">{list[0].regulation} syllabus</span>}
                  <span className="text-xs text-subtle tabular">{list.length} courses</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((subject, i) => (
                    <SubjectCard key={subject.id} subject={subject} index={i} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </Container>
  )
}
