import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Check, Search } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '@/components/ui/feedback'
import { Input } from '@/components/ui/primitives'
import { semLabel, useAcademic, useSemesterSubjects } from '@/hooks/useAcademic'
import { useDebounced } from '@/hooks/useData'
import type { SubjectListItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

/**
 * Pick one GRIET course. Lists the student's current-semester courses by default;
 * typing searches every course of every year and branch.
 */
export function CoursePicker({
  value,
  onPick,
  kind,
  columns = 2,
  maxHeight,
}: {
  value?: number | null
  onPick: (s: SubjectListItem) => void
  kind?: 'theory' | 'lab' | 'project'
  columns?: 1 | 2
  maxHeight?: string
}) {
  const { academic } = useAcademic()
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 200)
  const semester = useSemesterSubjects(kind)
  const found = useQuery({
    queryKey: ['subjects', 'pick', dq, kind],
    queryFn: () => api.subjects({ q: dq, kind, limit: 40 }),
    enabled: dq.length > 0,
    staleTime: 60_000,
  })
  const list = dq ? found.data : semester.data
  const loading = dq ? found.isLoading : semester.isLoading

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any GRIET course — name, short code or course code" className="pl-9" />
      </div>
      <div className="mb-2 text-2xs font-medium tracking-wider text-subtle uppercase">
        {dq ? `All years · ${found.data?.length ?? 0} matches` : `Your semester · ${academic.branch} ${semLabel(academic.year, academic.semester)}`}
      </div>
      <div className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2', maxHeight && 'overflow-y-auto pr-1')} style={maxHeight ? { maxHeight } : undefined}>
        {loading && (
          <div className="col-span-full flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!loading && !list?.length && (
          <p className="col-span-full py-4 text-center text-[13px] text-muted">{dq ? 'No course matches that.' : 'No courses listed for this semester — search above.'}</p>
        )}
        {list?.map((s) => (
          <motion.button
            key={s.id}
            type="button"
            whileTap={{ scale: 0.985 }}
            onClick={() => onPick(s)}
            className={cn(
              'relative flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-[border-color,background-color] duration-150',
              value === s.id ? 'border-accent/50 bg-accent-soft ring-4 ring-accent/10' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/50',
            )}
          >
            <span className="w-14 shrink-0 truncate font-mono text-[11px] font-semibold text-subtle">{s.code}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate font-mono text-[10px] text-subtle">
                {s.course_code} · {s.regulation}
                {s.year ? ` · ${semLabel(s.year, s.semester)}` : ''}
                {s.kind !== 'theory' ? ` · ${s.kind}` : ''}
              </span>
            </span>
            {value === s.id && (
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                <Check className="size-2.5" strokeWidth={3} />
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
