import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown, Layers, Search, Sparkles, TrendingUp, Upload, Zap } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { AcademicSwitcher } from '@/components/layout/AcademicSwitcher'
import { useCommandPalette } from '@/components/layout/CommandPalette'
import { ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { SubjectCard } from '@/components/resource/SubjectCard'
import { buttonVariants } from '@/components/ui/button'
import { GridBackdrop, RevealText, RotatingText } from '@/components/ui/effects'
import { AnimatedNumber } from '@/components/ui/feedback'
import { Kbd, SectionHeader, Skeleton } from '@/components/ui/primitives'
import { semLong, useAcademic, useMeta, useSemesterSubjects } from '@/hooks/useAcademic'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

const EXAMPLES = ['Machine learning decision trees', 'ML unit 3', 'Computer networks previous year paper', 'DBMS normalization', 'Operating systems deadlock']

export default function HomePage() {
  const { open } = useCommandPalette()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { academic, regulation } = useAcademic()
  const { data: meta } = useMeta()
  const { data: subjects, isLoading: loadingSubjects } = useSemesterSubjects()
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: api.branches, staleTime: 5 * 60_000 })
  const { data: trending, isLoading: loadingTrending } = useQuery({ queryKey: ['trending'], queryFn: () => api.trending(8) })

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <GridBackdrop />
        <Container className="relative pt-14 pb-16 sm:pt-20 lg:pt-24 lg:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Link
                to="/search?sort=newest"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-xs text-muted shadow-xs backdrop-blur transition-colors hover:border-border-strong hover:text-fg"
              >
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">GRIET</span>
                Current GR25 · GR24 · GR22 syllabus, every branch
                <ArrowRight className="size-3" />
              </Link>
            </motion.div>
            <h1 className="mt-6 text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-fg sm:text-display">
              <RevealText text="GRIET's study material." />
              <br />
              <RevealText text="Organized. Ranked. Ready to study." delay={0.25} className="text-muted" />
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base"
            >
              Every course you're studying this semester, with the official syllabus, notes, previous-year papers, mid and semester papers — and every other year one search away.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-9 max-w-xl">
              <button
                onClick={() => open()}
                className="group flex h-14 w-full items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 text-left shadow-md ring-accent/0 transition-[box-shadow,border-color] duration-200 hover:border-accent/40 hover:ring-4 hover:ring-accent/10"
              >
                <Search className="size-5 text-subtle transition-colors group-hover:text-accent" />
                <span className="flex-1 truncate text-[15px] text-subtle">
                  <span className="hidden sm:inline">Search notes, papers, subjects, topics… </span>
                  <span className="sm:hidden">Try </span>
                  <span className="text-muted sm:hidden">
                    “<RotatingText items={EXAMPLES} />”
                  </span>
                </span>
                <span className="hidden items-center gap-0.5 sm:flex">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                <span className="mr-1 text-xs text-subtle">Try</span>
                {EXAMPLES.slice(1).map((q) => (
                  <button
                    key={q}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)}
                    className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted transition-colors hover:border-border-strong hover:text-fg"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-12 flex items-center justify-center gap-8 text-sm sm:gap-12">
              {[
                { label: 'GRIET courses', value: meta?.course_count ?? 0 },
                { label: 'branches', value: branches?.length ?? 0 },
                { label: 'documents', value: meta?.resource_count ?? 0 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
                    {meta ? <AnimatedNumber value={s.value} compact /> : '—'}
                  </div>
                  <div className="mt-0.5 text-xs text-subtle">{s.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </Container>
      </section>

      <Container>
        <section>
          <SectionHeader
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                Your semester
                <AcademicSwitcher
                  align="start"
                  trigger={
                    <button className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-mono text-xs font-medium text-muted hover:border-border-strong hover:text-fg">
                      {academic.branch} · {semLong(academic.year, academic.semester)} <ChevronDown className="size-3" />
                    </button>
                  }
                />
              </span>
            }
            description={`The courses of GRIET's ${regulation} syllabus for this semester${user ? '' : ' — pick your branch and semester to make it yours'}. Each one has its units, syllabus and shared material.`}
            action={
              <Link to="/subjects" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                All years <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loadingSubjects
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
              : subjects?.map((s, i) => <SubjectCard key={s.id} subject={s} index={i} />)}
            {subjects && (
              <Link to="/exam" className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-dashed border-border-strong p-5 transition-colors hover:border-accent/50">
                <div className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Zap className="size-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Exam coming up?</h3>
                  <p className="mt-1 text-[13px] text-muted">Exam Mode builds a ranked prep path — PYQs, question banks and the best unit notes.</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                    Open Exam Mode <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </section>

        <section className="mt-14">
          <SectionHeader title="Browse by branch" description="Every B.Tech programme in GRIET's current syllabus books. Open any branch and year." />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {branches?.map((b) => (
              <Link
                key={b.code}
                to={`/subjects?branch=${b.code}&sem=all`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong"
              >
                <span className="grid h-8 w-12 shrink-0 place-items-center rounded-md bg-surface-2 font-mono text-[11px] font-semibold text-muted group-hover:text-accent">{b.code}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{b.name}</span>
                  <span className="block text-2xs text-subtle tabular">{b.subject_count} courses</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <TrendingUp className="size-4 text-accent" /> Trending resources
              </span>
            }
            description="Ranked by stars, ratings, views and freshness."
            action={
              <Link to="/search?sort=stars" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {loadingTrending
              ? Array.from({ length: 8 }).map((_, i) => <ResourceCardSkeleton key={i} />)
              : trending?.map((r, i) => <ResourceCard key={r.id} resource={{ ...r, recommended: false }} index={i} />)}
          </div>
        </section>

        <section className="mt-16 mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              { icon: Layers, title: 'Organized', body: 'Branch → Semester → Course → Unit, straight from GRIET\'s syllabus. No more scrolling through 40 WhatsApp files.' },
              { icon: Sparkles, title: 'Ranked', body: 'Relevance, stars, ratings and views decide what floats to the top.' },
              { icon: Zap, title: 'Ready to study', body: 'Open in the in-app reader, search inside any file, pick up where you left off.' },
            ].map((f) => (
              <div key={f.title} className="bg-surface p-6">
                <f.icon className="size-5 text-accent" />
                <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-start justify-between gap-4 border-t border-border p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Find the right study material without wasting time.</h3>
              <p className="mt-1 text-[13px] text-muted">Have notes that helped you? Share them — your upload is public instantly.</p>
            </div>
            <div className="flex gap-2">
              {!user && (
                <Link to="/signup" className={buttonVariants({ variant: 'secondary' })}>
                  Create account
                </Link>
              )}
              <Link to="/upload" className={cn(buttonVariants({ variant: 'primary' }))}>
                <Upload /> Upload
              </Link>
            </div>
          </div>
        </section>
      </Container>
    </>
  )
}
