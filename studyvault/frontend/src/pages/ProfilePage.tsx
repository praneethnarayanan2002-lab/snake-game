import { useQuery } from '@tanstack/react-query'
import { Eye, FolderUp, Library, Star } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { Avatar } from '@/components/ui/avatar'
import { AnimatedNumber, EmptyState } from '@/components/ui/feedback'
import { Card, SectionHeader, Skeleton } from '@/components/ui/primitives'
import { api } from '@/services/api'
import NotFoundPage from './NotFoundPage'

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { data, isLoading, error } = useQuery({ queryKey: ['profile', username], queryFn: () => api.profile(username) })
  if (error) return <NotFoundPage />
  const joined = data ? new Date(data.user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''

  return (
    <Container>
      <div className="relative mb-10 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="h-24 bg-grid bg-gradient-to-b from-accent-soft to-transparent" />
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-10 flex items-end gap-4">
            {data ? <Avatar name={data.user.full_name} size={80} className="border-4 border-surface text-2xl" /> : <Skeleton className="size-20 rounded-full" />}
            <div className="pb-1">
              {data ? (
                <>
                  <h1 className="text-xl font-semibold tracking-tight">{data.user.full_name}</h1>
                  <p className="text-[13px] text-muted">
                    @{data.user.username}
                    {data.user.college && ` · ${data.user.college}`} · joined {joined}
                  </p>
                </>
              ) : (
                <Skeleton className="h-10 w-48" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Library, label: 'Uploads', v: data?.stats.uploads },
              { icon: Star, label: 'Stars received', v: data?.stats.stars_received },
              { icon: Eye, label: 'Views', v: data?.stats.views_received },
            ].map((s) => (
              <Card key={s.label} className="min-w-24 px-3 py-2.5 text-center shadow-none">
                <div className="text-lg font-semibold tabular">{s.v === undefined ? '—' : <AnimatedNumber value={s.v} compact />}</div>
                <div className="flex items-center justify-center gap-1 text-2xs text-subtle">
                  <s.icon className="size-3" /> {s.label}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <SectionHeader title="Uploads" description="Sorted by stars." />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      ) : data?.uploads.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.uploads.map((r, i) => (
            <ResourceCard key={r.id} resource={{ ...r, recommended: false }} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState icon={FolderUp} title="No uploads yet" description="This student hasn't shared anything yet." />
      )}
    </Container>
  )
}
