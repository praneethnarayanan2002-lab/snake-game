import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Bookmark, BookOpen, Clock, FolderUp, Library, Play, Search, Star, Target, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { useCommandPalette } from '@/components/layout/CommandPalette'
import { FileGlyph, ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { buttonVariants } from '@/components/ui/button'
import { AnimatedNumber, EmptyState } from '@/components/ui/feedback'
import { Card, Kbd, SectionHeader, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/lib/auth'
import type { RecentItem, Resource } from '@/lib/types'
import { cn, firstName, greeting, timeAgo } from '@/lib/utils'
import { api } from '@/services/api'

export default function DashboardPage() {
  const { user } = useAuth()
  const { open } = useCommandPalette()
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })

  return (
    <Container>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[32px]">
          {greeting()}, {firstName(user?.full_name ?? '')}.
        </h1>
        <p className="mt-1 text-[15px] text-muted">What are you studying today?</p>
      </motion.div>

      <button
        onClick={() => open()}
        className="group mt-6 flex h-12 w-full max-w-2xl items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 text-left shadow-sm transition-[border-color,box-shadow] hover:border-accent/40 hover:ring-4 hover:ring-accent/10"
      >
        <Search className="size-[18px] text-subtle group-hover:text-accent" />
        <span className="flex-1 text-sm text-subtle">Search notes, papers, subjects, topics...</span>
        <span className="hidden gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { icon: Library, label: 'Resources uploaded', value: data?.stats.uploads },
          { icon: Star, label: 'Stars received', value: data?.stats.stars_received },
          { icon: Bookmark, label: 'Bookmarked', value: data?.stats.bookmarks },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
            <Card className="p-3 sm:p-5">
              <s.icon className="size-4 text-subtle" />
              <div className="mt-3 text-xl font-semibold tracking-tight sm:text-[26px]">{s.value === undefined ? <Skeleton className="h-7 w-10" /> : <AnimatedNumber value={s.value} />}</div>
              <div className="mt-0.5 text-[11px] text-muted sm:text-xs">{s.label}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Continue studying */}
      <section className="mt-12">
        <SectionHeader title="Continue studying" description="Pick up exactly where you left off." />
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : data?.recent.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.recent.slice(0, 4).map((item, i) => (
              <ContinueCard key={item.resource.id} item={item} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState icon={BookOpen} title="Nothing opened yet" description="Resources you read show up here with your page progress." action={<Link to="/subjects" className={buttonVariants({ size: 'sm' })}>Browse subjects</Link>} />
        )}
      </section>

      {data && data.subjects.length > 0 && (
        <section className="mt-12">
          <SectionHeader title="Your subjects" />
          <div className="flex flex-wrap gap-2">
            {data.subjects.map((s) => (
              <Link key={s.id} to={`/subjects/${s.slug}`} className="group inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pr-3 pl-2 text-[13px] transition-colors hover:border-border-strong">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">{s.code}</span>
                {s.name}
                <ArrowRight className="size-3 -translate-x-1 text-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            ))}
            <Link to="/exam" className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-accent/40 px-3 text-[13px] text-accent transition-colors hover:bg-accent-soft">
              <Target className="size-3.5" /> Exam mode
            </Link>
          </div>
        </section>
      )}

      <section className="mt-12">
        <SectionHeader title="Recommended for you" description="Top-ranked material in the subjects you study." action={<Link to="/search" className="text-[13px] text-muted hover:text-fg">See more</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading ? Array.from({ length: 3 }).map((_, i) => <ResourceCardSkeleton key={i} />) : data?.recommended.slice(0, 6).map((r, i) => <ResourceCard key={r.id} resource={r} index={i} />)}
        </div>
      </section>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <MiniList title="My bookmarks" icon={Bookmark} items={data?.bookmarks} loading={isLoading} href="/bookmarks" empty="Bookmark resources to build your own revision shelf." />
        <MiniList title="My uploads" icon={FolderUp} items={data?.uploads} loading={isLoading} href="/my-uploads" empty="Share your first document — your batch will thank you." emptyAction={<Link to="/upload" className={buttonVariants({ size: 'sm', variant: 'primary' })}><Upload /> Upload</Link>} />
      </div>

      <section className="mt-12">
        <SectionHeader title="Most popular" description="The most-starred resources across StudyVault." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading ? Array.from({ length: 3 }).map((_, i) => <ResourceCardSkeleton key={i} />) : data?.popular.map((r, i) => <ResourceCard key={r.id} resource={{ ...r, recommended: false }} index={i} />)}
        </div>
      </section>
    </Container>
  )
}

function ContinueCard({ item, index }: { item: RecentItem; index: number }) {
  const r = item.resource
  const pct = r.page_count ? Math.round((item.last_page / r.page_count) * 100) : 0
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Link to={`/resources/${r.id}?page=${item.last_page}`} className="group flex gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md">
        <FileGlyph type={r.resource_type} ext={r.file_ext} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{r.title}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3" /> Last opened {timeAgo(item.viewed_at)}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.2 + index * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <span className="text-2xs text-subtle tabular">
              p. {item.last_page}/{r.page_count}
            </span>
          </div>
        </div>
        <span className="hidden items-center gap-1 self-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors group-hover:border-accent/40 group-hover:bg-accent-soft group-hover:text-accent sm:inline-flex">
          <Play className="size-3" /> Continue
        </span>
      </Link>
    </motion.div>
  )
}

function MiniList({
  title,
  icon: Icon,
  items,
  loading,
  href,
  empty,
  emptyAction,
}: {
  title: string
  icon: typeof Bookmark
  items?: Resource[]
  loading: boolean
  href: string
  empty: string
  emptyAction?: React.ReactNode
}) {
  return (
    <section>
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Icon className="size-4 text-subtle" /> {title}
          </span>
        }
        action={
          <Link to={href} className="text-[13px] text-muted hover:text-fg">
            View all
          </Link>
        }
      />
      {loading ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : items?.length ? (
        <Card className="divide-y divide-border overflow-hidden">
          {items.slice(0, 5).map((r) => (
            <Link key={r.id} to={`/resources/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{r.title}</div>
                <div className="text-xs text-muted">
                  {r.subject.code} · Unit {r.unit.number} · {r.resource_type_label}
                </div>
              </div>
              <span className={cn('inline-flex items-center gap-1 text-xs tabular', r.star_count ? 'text-muted' : 'text-subtle')}>
                <Star className="size-3" /> {r.star_count}
              </span>
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState icon={Icon} title={`No ${title.toLowerCase().replace('my ', '')} yet`} description={empty} action={emptyAction} className="py-10" />
      )}
    </section>
  )
}
