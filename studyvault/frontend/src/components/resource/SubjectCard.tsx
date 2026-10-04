import { motion } from 'framer-motion'
import { ArrowRight, FlaskConical, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge } from '@/components/ui/primitives'
import { semLabel } from '@/hooks/useAcademic'
import type { SubjectListItem } from '@/lib/types'

export function SubjectCard({ subject: s, index = 0 }: { subject: SubjectListItem; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.03 }}>
      <Link to={`/subjects/${s.slug}`} className="block h-full">
        <SpotlightCard className="h-full p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted">{s.code}</span>
              {s.kind === 'lab' && (
                <Badge>
                  <FlaskConical /> Lab
                </Badge>
              )}
              {s.kind === 'project' && <Badge>Project</Badge>}
              {s.elective && <Badge tone="accent">{s.elective}</Badge>}
            </div>
            <ArrowRight className="size-4 shrink-0 -translate-x-1 text-subtle opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <h3 className="mt-3 line-clamp-2 text-[14px] leading-snug font-semibold tracking-tight text-fg">{s.name}</h3>
          <div className="mt-1 font-mono text-[11px] text-subtle">
            {s.course_code} · {s.regulation}
            {s.year ? ` · ${semLabel(s.year, s.semester)}` : ''}
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-subtle tabular">
            {s.kind === 'theory' && (
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3" /> {s.unit_count} units
              </span>
            )}
            <span>{s.resource_count} {s.resource_count === 1 ? 'resource' : 'resources'}</span>
            {s.ltpc && <span className="ml-auto font-mono text-[10px]">L/T/P/C {s.ltpc}</span>}
          </div>
        </SpotlightCard>
      </Link>
    </motion.div>
  )
}
