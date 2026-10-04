import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Check, Play, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/primitives'
import { semLabel, useAcademic, useSemesterSubjects } from '@/hooks/useAcademic'
import type { Resource } from '@/lib/types'
import { cn, pad2 } from '@/lib/utils'
import { api } from '@/services/api'

const EXAMS = [
  { value: 'semester', label: 'Semester' },
  { value: 'mid1', label: 'Mid 1' },
  { value: 'mid2', label: 'Mid 2' },
]

function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      setV(raw ? (JSON.parse(raw) as T) : initial)
    } catch {
      setV(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = (next: T) => {
    setV(next)
    localStorage.setItem(key, JSON.stringify(next))
  }
  return [v, set] as const
}

function defaultDate() {
  const d = new Date()
  d.setDate(d.getDate() + 20)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export default function ExamModePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { academic } = useAcademic()
  const { data: subjects } = useSemesterSubjects('theory')
  const subject = params.get('subject') || subjects?.[0]?.slug || ''
  const exam = params.get('exam') || 'semester'
  const { data: plan, isLoading } = useQuery({
    queryKey: ['exam-plan', subject, exam],
    queryFn: () => api.examPlan(subject, exam),
    enabled: !!subject,
  })

  const [examDate, setExamDate] = useLocalState(`sv-exam-date:${subject}:${exam}`, defaultDate())
  const [done, setDone] = useLocalState<number[]>(`sv-exam-done:${subject}:${exam}`, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.max(0, Math.round((new Date(examDate + 'T00:00:00').getTime() - today.getTime()) / 86_400_000))
  const allItems = useMemo(() => plan?.steps.flatMap((s) => s.items) ?? [], [plan])
  const uniqueIds = [...new Set(allItems.map((r) => r.id))]
  const completed = uniqueIds.filter((id) => done.includes(id)).length
  const pct = uniqueIds.length ? completed / uniqueIds.length : 0
  const nextUp = allItems.find((r) => !done.includes(r.id))

  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => n.set(k, v))
    setParams(n, { replace: true })
  }
  const toggle = (id: number) => setDone(done.includes(id) ? done.filter((x) => x !== id) : [...done, id])

  return (
    <Container className="max-w-5xl">
      {/* Always-dark focus canvas: deliberately different from the rest of the app */}
      <div className="dark relative overflow-hidden rounded-2xl border border-white/10 bg-[#08080b] text-zinc-100 shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70 mask-fade-b" />
        <motion.div
          className="pointer-events-none absolute -top-40 -right-20 size-[420px] rounded-full bg-accent/25 blur-[120px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.25em] text-accent">
              <motion.span className="size-1.5 rounded-full bg-accent" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
              EXAM MODE
            </div>
            <div className="flex flex-wrap gap-1.5">
              <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                {EXAMS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => set({ exam: e.value })}
                    className={cn('h-7 rounded-md px-2.5 text-xs font-medium transition-colors', exam === e.value ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white')}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <label className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-400">
                <CalendarDays className="size-3.5" />
                <input type="date" value={examDate} onChange={(e) => e.target.value && setExamDate(e.target.value)} className="bg-transparent text-zinc-200 outline-none [color-scheme:dark]" aria-label="Exam date" />
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="shrink-0 pr-1 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
              {academic.branch} {semLabel(academic.year, academic.semester)}
            </span>
            {plan && !subjects?.some((s) => s.slug === plan.subject.slug) && (
              <span className="h-7 shrink-0 rounded-md border border-accent/50 bg-accent/15 px-2.5 font-mono text-[11px] leading-7 font-semibold text-white">{plan.subject.code}</span>
            )}
            {subjects?.map((s) => (
              <button
                key={s.slug}
                onClick={() => set({ subject: s.slug })}
                className={cn(
                  'h-7 shrink-0 rounded-md border px-2.5 font-mono text-[11px] font-semibold transition-colors',
                  subject === s.slug ? 'border-accent/50 bg-accent/15 text-white' : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-white',
                )}
              >
                {s.code}
              </button>
            ))}
          </div>

          <div className="mt-10 grid items-end gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <AnimatePresence mode="wait">
                <motion.div key={subject + exam} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                  <div className="text-6xl leading-none font-semibold tracking-[-0.04em] text-white sm:text-8xl">{plan?.subject.code ?? '···'}</div>
                  <div className="mt-3 text-lg text-zinc-300 sm:text-xl">{plan?.exam_label ?? 'Preparing your plan'}</div>
                  {plan && <div className="mt-1 text-sm text-zinc-500">{plan.subject.name} · covers Units {plan.scope_units.join(', ')}</div>}
                </motion.div>
              </AnimatePresence>
              <div className="mt-6 inline-flex items-baseline gap-2">
                <motion.span key={days} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-4xl font-semibold text-white tabular">
                  {days}
                </motion.span>
                <span className="text-sm text-zinc-400">{days === 1 ? 'day' : 'days'} remaining</span>
              </div>
            </div>
            <ProgressRing value={pct} label={`${completed}/${uniqueIds.length}`} />
          </div>

          <div className="mt-12">
            <div className="mb-4 text-xs font-medium tracking-wide text-zinc-500 uppercase">Your recommended preparation</div>
            {isLoading || !plan ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-xl !bg-white/5" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {plan.steps.map((step, i) => (
                  <StepBlock key={step.key + plan.subject.slug + exam} index={i} title={step.title} subtitle={step.subtitle} items={step.items} done={done} onToggle={toggle} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <p className="text-sm text-zinc-400">
              {nextUp ? (
                <>
                  Next up: <span className="text-zinc-200">{nextUp.title}</span>
                </>
              ) : uniqueIds.length ? (
                'Everything done. Go get that grade.'
              ) : (
                'No material for this exam yet.'
              )}
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!nextUp}
              onClick={() => nextUp && navigate(`/resources/${nextUp.id}`)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-zinc-900 shadow-[0_8px_30px_-8px_rgba(116,112,247,0.6)] disabled:opacity-40"
            >
              <Play className="size-4 fill-current" /> Start studying
            </motion.button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-subtle">Plans are generated from the ranking engine — PYQs and question banks with the most stars and best ratings come first.</p>
    </Container>
  )
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid size-32 place-items-center">
      <svg viewBox="0 0 110 110" className="absolute inset-0 -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
        <motion.circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="text-center">
        <div className="text-2xl font-semibold text-white tabular">{Math.round(value * 100)}%</div>
        <div className="text-2xs text-zinc-500 tabular">{label} done</div>
      </div>
    </div>
  )
}

function StepBlock({ index, title, subtitle, items, done, onToggle }: { index: number; title: string; subtitle: string; items: Resource[]; done: number[]; onToggle: (id: number) => void }) {
  const finished = items.filter((r) => done.includes(r.id)).length
  const pct = items.length ? finished / items.length : 0
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08, duration: 0.35 }} className="rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span className={cn('font-mono text-2xl font-semibold tabular transition-colors', pct === 1 ? 'text-accent' : 'text-zinc-600')}>{pad2(index + 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-white">{title}</div>
              {subtitle && <div className="text-xs text-zinc-500">{subtitle}</div>}
            </div>
            <span className="text-xs text-zinc-500 tabular">
              {finished}/{items.length}
            </span>
          </div>
          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">Nothing here yet — <Link to="/upload" className="text-accent hover:underline">upload one</Link>.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {items.map((r) => {
                const isDone = done.includes(r.id)
                return (
                  <li key={r.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                    <button
                      onClick={() => onToggle(r.id)}
                      className={cn('grid size-4.5 shrink-0 place-items-center rounded-[5px] border transition-colors', isDone ? 'border-accent bg-accent text-white' : 'border-white/20 hover:border-white/40')}
                      aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                    >
                      {isDone && <Check className="size-3" strokeWidth={3} />}
                    </button>
                    <Link to={`/resources/${r.id}`} className={cn('min-w-0 flex-1 truncate text-[13px] transition-colors', isDone ? 'text-zinc-500 line-through' : 'text-zinc-200 hover:text-white')}>
                      {r.title}
                    </Link>
                    <span className="hidden items-center gap-1 text-xs text-zinc-500 tabular sm:inline-flex">
                      <Star className="size-3 fill-star text-star" /> {r.average_rating.toFixed(1)} · {r.star_count}★
                    </span>
                    <ArrowRight className="size-3.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  )
}
