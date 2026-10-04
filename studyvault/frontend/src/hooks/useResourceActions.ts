import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { Resource, Stats } from '@/lib/types'
import { api } from '@/services/api'

type Counters = Pick<Resource, 'star_count' | 'rating_count' | 'average_rating' | 'bookmark_count' | 'view_count'>

/**
 * Optimistic star / bookmark / rate state for one resource. Keeps the UI instant and
 * reconciles with the server's recomputed counters.
 */
export function useResourceActions(resource: Resource) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  const [counts, setCounts] = useState<Counters>(resource)
  const [starred, setStarred] = useState(!!resource.viewer?.starred)
  const [bookmarked, setBookmarked] = useState(!!resource.viewer?.bookmarked)
  const [myRating, setMyRating] = useState<number | null>(resource.viewer?.my_rating ?? null)
  const [reported, setReported] = useState(!!resource.viewer?.reported)

  useEffect(() => {
    setCounts(resource)
    setStarred(!!resource.viewer?.starred)
    setBookmarked(!!resource.viewer?.bookmarked)
    setMyRating(resource.viewer?.my_rating ?? null)
    setReported(!!resource.viewer?.reported)
  }, [resource])

  const apply = useCallback((s: Stats) => {
    setCounts((c) => ({ ...c, ...s }))
    setStarred(s.viewer.starred)
    setBookmarked(s.viewer.bookmarked)
    setMyRating(s.viewer.my_rating)
  }, [])

  const requireAuth = useCallback(
    (verb: string) => {
      if (user) return true
      toast(`Sign in to ${verb}`, {
        description: 'It takes 20 seconds and keeps your library in sync.',
        action: { label: 'Sign in', onClick: () => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`) },
      })
      return false
    },
    [user, navigate, location],
  )

  const refreshLists = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['resource', resource.id] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['bookmarks'] })
  }, [qc, resource.id])

  const toggleStar = useCallback(async () => {
    if (!requireAuth('star resources')) return
    const next = !starred
    setStarred(next)
    setCounts((c) => ({ ...c, star_count: c.star_count + (next ? 1 : -1) }))
    try {
      apply(await api.star(resource.id, next))
      refreshLists()
    } catch (e) {
      setStarred(!next)
      setCounts((c) => ({ ...c, star_count: c.star_count + (next ? -1 : 1) }))
      toast.error((e as Error).message)
    }
  }, [requireAuth, starred, resource.id, apply, refreshLists])

  const toggleBookmark = useCallback(async () => {
    if (!requireAuth('bookmark resources')) return
    const next = !bookmarked
    setBookmarked(next)
    try {
      apply(await api.bookmark(resource.id, next))
      refreshLists()
      toast.success(next ? 'Saved to bookmarks' : 'Removed from bookmarks')
    } catch (e) {
      setBookmarked(!next)
      toast.error((e as Error).message)
    }
  }, [requireAuth, bookmarked, resource.id, apply, refreshLists])

  const rate = useCallback(
    async (rating: number) => {
      if (!requireAuth('rate resources')) return
      const prev = myRating
      setMyRating(rating)
      try {
        apply(await api.rate(resource.id, rating))
        refreshLists()
        toast.success(prev ? `Rating updated to ${rating}★` : `Thanks! You rated this ${rating}★`)
      } catch (e) {
        setMyRating(prev)
        toast.error((e as Error).message)
      }
    },
    [requireAuth, myRating, resource.id, apply, refreshLists],
  )

  return {
    counts,
    starred,
    bookmarked,
    myRating,
    reported,
    setReported,
    setCounts,
    toggleStar,
    toggleBookmark,
    rate,
    requireAuth,
    apply,
  }
}
