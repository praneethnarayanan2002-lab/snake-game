import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/AppShell'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'

export default function NotFoundPage() {
  return (
    <Container className="max-w-xl py-20">
      <EmptyState
        icon={FileQuestion}
        title="This page went missing"
        description="It may have been removed by its uploader or a moderator."
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Back to library
          </Link>
        }
      />
    </Container>
  )
}
