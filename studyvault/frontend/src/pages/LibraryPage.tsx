import { useQuery } from '@tanstack/react-query'
import { Bookmark, FolderUp, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { ResourceCard, ResourceCardSkeleton } from '@/components/resource/ResourceCard'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/primitives'
import { api } from '@/services/api'

export default function LibraryPage({ kind }: { kind: 'bookmarks' | 'uploads' }) {
  const isBookmarks = kind === 'bookmarks'
  const { data, isLoading } = useQuery({ queryKey: [kind], queryFn: isBookmarks ? api.myBookmarks : api.myUploads })
  const stars = data?.reduce((n, r) => n + r.star_count, 0) ?? 0
  return (
    <Container>
      <PageHeader
        eyebrow="Your library"
        title={isBookmarks ? 'Bookmarks' : 'My uploads'}
        description={
          isBookmarks
            ? 'Your personal revision shelf.'
            : data?.length
              ? `${data.length} resources shared · ${stars} stars received`
              : 'Everything you share shows up here.'
        }
        actions={
          !isBookmarks && (
            <Link to="/upload" className={buttonVariants({ variant: 'primary' })}>
              <Upload /> Upload
            </Link>
          )
        }
      />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      ) : data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((r, i) => (
            <ResourceCard key={r.id} resource={r} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={isBookmarks ? Bookmark : FolderUp}
          title={isBookmarks ? 'No bookmarks yet' : 'You haven’t uploaded anything yet'}
          description={isBookmarks ? 'Tap the bookmark icon on any resource to save it here for later.' : 'Upload notes or papers that helped you — they become public instantly and climb the rankings as people star them.'}
          action={
            <Link to={isBookmarks ? '/subjects' : '/upload'} className={buttonVariants({ variant: isBookmarks ? 'secondary' : 'primary', size: 'sm' })}>
              {isBookmarks ? 'Browse subjects' : 'Upload your first document'}
            </Link>
          }
        />
      )}
    </Container>
  )
}
