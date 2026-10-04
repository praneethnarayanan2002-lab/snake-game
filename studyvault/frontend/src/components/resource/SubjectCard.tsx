import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SpotlightCard } from '@/components/ui/effects'
import type { Subject } from '@/lib/types'
import { formatCount } from '@/lib/utils'

export function SubjectCard({ subject, index = 0 }: { subject: Subject; index?: number }) {
  const max = Math.max(...subject.units.map((u) => u.star_count), 1)
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
      <Link to={`/subjects/${subject.slug}`} className="block h-full">
        <SpotlightCard className="h-full p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong">
          <div className="flex items-start justify-between">
            <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted">
              {subject.code}
            </span>
            <ArrowRight className="size-4 -translate-x-1 text-subtle opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-fg">{subject.name}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted">{subject.description}</p>
          {/* Stars per unit: where the community's favourite material is */}
          <div className="mt-5 flex h-6 items-end gap-1" aria-hidden>
            {subject.units.map((u) => (
              <div key={u.id} className="flex-1 rounded-sm bg-surface-3 transition-colors group-hover:bg-accent/40" title={`Unit ${u.number}: ${u.star_count} stars`} style={{ height: `${20 + (u.star_count / max) * 80}%` }} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-subtle tabular">
            <span>{subject.resource_count} resources</span>
            <span>·</span>
            <span>{subject.units.length} units</span>
            <span>·</span>
            <span>{formatCount(subject.star_count)} stars</span>
          </div>
        </SpotlightCard>
      </Link>
    </motion.div>
  )
}
