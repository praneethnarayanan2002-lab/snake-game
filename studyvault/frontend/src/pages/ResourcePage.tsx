import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Download, Eye, Flag, Layers, Pencil, Star, Tag, Trash2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RecommendedBadge } from '@/components/resource/ResourceCard'
import { ConfirmDialog, EditResourceDialog, ReportDialog } from '@/components/resource/ResourceDialogs'
import { BookmarkToggle, RatingInput, StarToggle } from '@/components/resource/StarControls'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AnimatedNumber, Spinner } from '@/components/ui/feedback'
import { Badge, Card, Skeleton } from '@/components/ui/primitives'
import { useResourceActions } from '@/hooks/useResourceActions'
import { useAuth } from '@/lib/auth'
import type { Resource } from '@/lib/types'
import { cn, formatBytes, timeAgo } from '@/lib/utils'
import { api, fileUrl } from '@/services/api'
import NotFoundPage from './NotFoundPage'

const PdfViewer = lazy(() => import('@/components/resource/PdfViewer').then((m) => ({ default: m.PdfViewer })))

export default function ResourcePage() {
  const id = Number(useParams().id)
  const { data, isLoading, error } = useQuery({ queryKey: ['resource', id], queryFn: () => api.resource(id), enabled: Number.isFinite(id) })
  if (error) return <NotFoundPage />
  if (isLoading || !data) return <ResourceSkeleton />
  return <ResourceView key={data.id} resource={data} />
}

function ResourceView({ resource: r }: { resource: Resource }) {
  const a = useResourceActions(r)
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [reportOpen, setReportOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const canManage = !!user && (user.id === r.uploader.id || user.is_admin)

  // Count the view once per mount (guards against StrictMode double effects).
  const viewed = useRef(false)
  const { apply } = a
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    api
      .recordView(r.id)
      .then((s) => {
        apply(s)
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      })
      .catch(() => {})
  }, [r.id, apply, qc])

  const progressTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onPageChange = useCallback(
    (page: number) => {
      if (!user) return
      clearTimeout(progressTimer.current)
      progressTimer.current = setTimeout(() => api.saveProgress(r.id, page).catch(() => {}), 1200)
    },
    [user, r.id],
  )

  const { data: related } = useQuery({
    queryKey: ['related', r.id],
    queryFn: () => api.search({ subject: r.subject.slug, unit: r.unit.number, limit: 6 }),
  })

  const download = () => {
    window.location.href = fileUrl(r, true)
  }

  return (
    <div className="flex flex-col lg:h-dvh">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/subjects/${r.subject.slug}`))}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">{r.title}</h1>
          <div className="truncate text-xs text-muted">
            <Link to={`/subjects/${r.subject.slug}`} className="hover:text-fg">
              {r.subject.code}
            </Link>{' '}
            ·{' '}
            <Link to={`/subjects/${r.subject.slug}?unit=${r.unit.number}`} className="hover:text-fg">
              Unit {r.unit.number}
            </Link>{' '}
            · {r.resource_type_label} · {r.year}
          </div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <StarToggle starred={a.starred} count={a.counts.star_count} onToggle={a.toggleStar} />
          <BookmarkToggle bookmarked={a.bookmarked} onToggle={a.toggleBookmark} label />
          <Button size="sm" variant="primary" onClick={download}>
            <Download /> Download
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Mobile quick stats */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 md:hidden">
          <Stats a={a} compact />
          <div className="flex items-center gap-1.5">
            <StarToggle starred={a.starred} count={a.counts.star_count} onToggle={a.toggleStar} showCount={false} />
            <BookmarkToggle bookmarked={a.bookmarked} onToggle={a.toggleBookmark} />
            <Button size="icon-sm" variant="secondary" onClick={download} aria-label="Download">
              <Download />
            </Button>
          </div>
        </div>

        <div className="h-[78dvh] min-h-0 p-2 sm:p-4 lg:h-auto lg:flex-1">
          <Suspense fallback={<div className="grid h-full place-items-center rounded-xl border border-border bg-surface-2"><Spinner /></div>}>
            <PdfViewer url={fileUrl(r)} downloadUrl={fileUrl(r, true)} initialPage={Number(params.get('page')) || 1} onPageChange={onPageChange} />
          </Suspense>
        </div>

        {/* Details sidebar */}
        <aside className="shrink-0 space-y-4 overflow-y-auto border-border p-4 sm:px-6 lg:w-[340px] lg:border-l lg:px-5">
          {r.recommended && <RecommendedBadge />}
          <Card className="p-4">
            <Stats a={a} />
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-medium">{a.myRating ? 'Your rating' : 'Rate this resource'}</div>
            <p className="mb-3 text-xs text-muted">Ratings help the best material rise to the top.</p>
            <RatingInput value={a.myRating} onRate={a.rate} />
          </Card>

          <Card className="divide-y divide-border">
            <Link to={`/u/${r.uploader.username}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-2/50">
              <Avatar name={r.uploader.full_name} size={34} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{r.uploader.full_name}</div>
                <div className="text-xs text-muted">
                  @{r.uploader.username} · uploaded {timeAgo(r.created_at)}
                </div>
              </div>
            </Link>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-4 text-[13px]">
              <Meta icon={Layers} label="Subject" value={<Link to={`/subjects/${r.subject.slug}`} className="hover:text-accent">{r.subject.name}</Link>} wide />
              <Meta icon={Layers} label="Unit" value={`${r.unit.number} · ${r.unit.title}`} wide />
              <Meta icon={Tag} label="Type" value={r.resource_type_label} />
              <Meta icon={Calendar} label="Year" value={r.year} />
              {r.exam_type_label && <Meta icon={Calendar} label="Exam" value={r.exam_type_label} />}
              <Meta icon={Layers} label="File" value={`${r.page_count} pages · ${formatBytes(r.file_size)}`} />
            </dl>
            {(r.description || r.tags.length > 0) && (
              <div className="space-y-3 p-4">
                {r.description && <p className="text-[13px] leading-relaxed text-muted">{r.description}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <Link key={t} to={`/search?q=${encodeURIComponent(t)}`}>
                        <Badge className="hover:border-border-strong hover:text-fg">#{t}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => a.requireAuth('report resources') && setReportOpen(true)} disabled={a.reported}>
              <Flag /> {a.reported ? 'Reported' : 'Report'}
            </Button>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete
                </Button>
              </>
            )}
          </div>

          {related && related.items.filter((x) => x.id !== r.id).length > 0 && (
            <div className="pt-2">
              <div className="mb-2 text-2xs font-medium tracking-wider text-subtle uppercase">More from Unit {r.unit.number}</div>
              <div className="space-y-1">
                {related.items
                  .filter((x) => x.id !== r.id)
                  .slice(0, 5)
                  .map((x) => (
                    <Link key={x.id} to={`/resources/${x.id}`} className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium group-hover:text-fg">{x.title}</div>
                        <div className="text-xs text-muted">
                          {x.resource_type_label} · {x.year}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-subtle tabular">
                        <Star className="size-3" /> {x.star_count}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <ReportDialog resource={r} open={reportOpen} onOpenChange={setReportOpen} onReported={() => a.setReported(true)} />
      {canManage && (
        <>
          <EditResourceDialog resource={r} open={editOpen} onOpenChange={setEditOpen} />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete this resource?"
            description="The PDF and its stars, ratings and bookmarks will be permanently removed."
            onConfirm={async () => {
              await api.deleteResource(r.id)
              toast.success('Resource deleted')
              qc.invalidateQueries()
              navigate(`/subjects/${r.subject.slug}`)
            }}
          />
        </>
      )}
    </div>
  )
}

function Stats({ a, compact = false }: { a: ReturnType<typeof useResourceActions>; compact?: boolean }) {
  const items = [
    { icon: <Star className="size-4 fill-star text-star" />, value: a.counts.average_rating ? a.counts.average_rating.toFixed(1) : '—', label: `${a.counts.rating_count} ratings` },
    { icon: <Star className="size-4 text-muted" />, value: <AnimatedNumber value={a.counts.star_count} compact />, label: 'stars' },
    { icon: <Eye className="size-4 text-muted" />, value: <AnimatedNumber value={a.counts.view_count} compact />, label: 'views' },
  ]
  if (compact)
    return (
      <div className="flex items-center gap-3 text-xs text-muted">
        {items.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1 tabular [&_svg]:size-3.5">
            {s.icon}
            <span className="font-medium text-fg">{s.value}</span>
          </span>
        ))}
      </div>
    )
  return (
    <div className="grid grid-cols-3 divide-x divide-border">
      {items.map((s, i) => (
        <div key={i} className={cn('flex flex-col items-center gap-1 text-center')}>
          {s.icon}
          <span className="text-lg font-semibold tracking-tight tabular">{s.value}</span>
          <span className="text-2xs text-subtle">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function Meta({ icon: Icon, label, value, wide }: { icon: typeof Layers; label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="flex items-center gap-1 text-2xs font-medium tracking-wide text-subtle uppercase">
        <Icon className="size-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-fg">{value}</dd>
    </div>
  )
}

function ResourceSkeleton() {
  return (
    <div className="flex flex-col lg:h-dvh">
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-80" />
      </div>
      <div className="flex flex-1 gap-4 p-4">
        <Skeleton className="h-[70vh] flex-1 rounded-xl" />
        <div className="hidden w-[320px] space-y-4 lg:block">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

