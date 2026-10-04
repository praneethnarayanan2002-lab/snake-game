import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Responses can arrive out of order on slow networks; only the newest request's
  // stats are applied (view counts only ever grow, so they're merged with max).
  const issued = useRef(0)
  const applied = useRef(0)
  const nextSeq = () => ++issued.current

  const apply = useCallback(
    (s: Stats, seq = 0) => {
      const stale = seq < applied.current || (seq === 0 && applied.current > 0)
      if (!stale) applied.current = seq
      const merge = <T extends Counters>(c: T): T =>
        stale ? { ...c, view_count: Math.max(c.view_count, s.view_count) } : { ...c, ...s, view_count: Math.max(c.view_count, s.view_count) }
      setCounts(merge)
      if (!stale) {
        setStarred(s.viewer.starred)
        setBookmarked(s.viewer.bookmarked)
        setMyRating(s.viewer.my_rating)
      }
      // Keep the cached resource in sync instead of refetching it (a refetch started
      // before a later mutation would otherwise overwrite newer state).
      qc.setQueryData<Resource>(['resource', resource.id], (old) => {
        if (!old) return old
        const { viewer, ...counters } = s
        const next = merge({ ...old, ...(stale ? {} : counters) })
        return stale ? next : { ...next, viewer: { ...(old.viewer ?? { reported: false }), ...viewer } }
      })
    },
    [qc, resource.id],
  )

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
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['bookmarks'] })
  }, [qc])

  const toggleStar = useCallback(async () => {
    if (!requireAuth('star resources')) return
    const next = !starred
    setStarred(next)
    setCounts((c) => ({ ...c, star_count: c.star_count + (next ? 1 : -1) }))
    try {
      const seq = nextSeq()
      apply(await api.star(resource.id, next), seq)
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
      const seq = nextSeq()
      apply(await api.bookmark(resource.id, next), seq)
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
        const seq = nextSeq()
        apply(await api.rate(resource.id, rating), seq)
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
