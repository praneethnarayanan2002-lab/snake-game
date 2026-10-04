import { useEffect, useState } from 'react'

export function useDebounced<T>(value: T, delay = 180): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const RECENT_KEY = 'sv-recent-searches'

export function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function pushRecentSearch(q: string) {
  const query = q.trim()
  if (!query) return
  const next = [query, ...getRecentSearches().filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, 6)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY)
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}
