import { Container } from '@/components/layout/AppShell'
import { SubjectCard } from '@/components/resource/SubjectCard'
import { PageHeader, Skeleton } from '@/components/ui/primitives'
import { useSubjects } from '@/hooks/useData'

export default function SubjectsPage() {
  const { data, isLoading } = useSubjects()
  return (
    <Container>
      <PageHeader eyebrow="Library" title="Subjects" description="Pick a subject, then a unit. Everything inside is grouped by resource type and year." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />) : data?.map((s, i) => <SubjectCard key={s.id} subject={s} index={i} />)}
      </div>
    </Container>
  )
}
