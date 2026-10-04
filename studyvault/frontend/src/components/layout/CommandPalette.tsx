import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Clock,
  CornerDownLeft,
  Hash,
  LayoutDashboard,
  Search,
  Star,
  Target,
  Upload,
  X,
} from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileGlyph } from '@/components/resource/ResourceCard'
import { Dialog } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/primitives'
import { clearRecentSearches, getRecentSearches, pushRecentSearch, useDebounced, useSubjects } from '@/hooks/useData'
import { RESOURCE_TYPES, TYPE_BY_VALUE } from '@/lib/constants'
import { cn, formatCount } from '@/lib/utils'
import { api } from '@/services/api'

const PaletteContext = createContext<{ open: (initial?: string) => void } | null>(null)

export function useCommandPalette() {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider')
  return ctx
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const open = useCallback((initial = '') => {
    setQuery(initial)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PaletteContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen} top hideClose className="max-w-[640px]">
        <PaletteBody query={query} setQuery={setQuery} close={() => setOpen(false)} />
      </Dialog>
    </PaletteContext.Provider>
  )
}

function Item({
  value,
  onSelect,
  children,
  className,
}: {
  value: string
  onSelect: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn('group relative mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg outline-none', className)}
    >
      {children}
      <ArrowRight className="cmdk-arrow ml-auto size-3.5 shrink-0 -translate-x-1 text-subtle opacity-0 transition-all duration-150" />
    </Command.Item>
  )
}

function IconBox({ children }: { children: ReactNode }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-muted [&_svg]:size-3.5">{children}</span>
}

function PaletteBody({ query, setQuery, close }: { query: string; setQuery: (q: string) => void; close: () => void }) {
  const navigate = useNavigate()
  const { data: subjects = [] } = useSubjects()
  const [recent, setRecent] = useState(getRecentSearches)
  const q = useDebounced(query.trim(), 140)

  const { data, isFetching } = useQuery({
    queryKey: ['palette', q],
    queryFn: () => api.search({ q, limit: 6 }),
    enabled: q.length > 0,
    placeholderData: (prev) => prev,
  })

  const go = (path: string, remember?: string) => {
    if (remember) pushRecentSearch(remember)
    close()
    navigate(path)
  }

  const lower = q.toLowerCase()
  const subjectMatches = useMemo(
    () => (q ? subjects.filter((s) => `${s.name} ${s.code} ${s.slug}`.toLowerCase().includes(lower)) : subjects),
    [subjects, q, lower],
  )
  const unitMatches = useMemo(() => {
    if (q.length < 3) return []
    return subjects
      .flatMap((s) => s.units.map((u) => ({ s, u })))
      .filter(({ u }) => `${u.title} ${u.topics}`.toLowerCase().includes(lower))
      .slice(0, 4)
  }, [subjects, q, lower])

  const parsed = data?.parsed
  const chips = parsed
    ? [
        parsed.subject && parsed.subject.code,
        parsed.unit_number && `Unit ${parsed.unit_number}`,
        parsed.resource_type && TYPE_BY_VALUE[parsed.resource_type]?.label,
        parsed.year && String(parsed.year),
        parsed.exam_type && parsed.exam_type.replace('mid', 'Mid '),
      ].filter(Boolean)
    : []
  const showResults = q.length > 0 && data && data.parsed.raw === q

  return (
    <Command shouldFilter={false} loop className="flex max-h-[min(70vh,560px)] flex-col">
      <div className="relative flex items-center gap-3 border-b border-border px-4">
        <Search className="size-[18px] shrink-0 text-subtle" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search notes, papers, subjects, topics..."
          className="h-14 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
          onKeyDown={(e) => {
            // Enter with no highlighted result goes to the full results page.
            if (e.key === 'Enter' && query.trim() && !document.querySelector('[cmdk-item][data-selected="true"]')) {
              go(`/search?q=${encodeURIComponent(query.trim())}`, query)
            }
          }}
        />
        {query ? (
          <button onClick={() => setQuery('')} className="rounded p-1 text-subtle hover:text-fg" aria-label="Clear">
            <X className="size-4" />
          </button>
        ) : (
          <Kbd>Esc</Kbd>
        )}
        <AnimatePresence>
          {isFetching && (
            <motion.div
              className="absolute right-0 bottom-0 left-0 h-px overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="h-full w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {chips.length > 0 && showResults && (
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs text-muted">
          <span className="text-subtle">Understood as</span>
          {chips.map((c) => (
            <span key={String(c)} className="rounded-md border border-accent/20 bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
              {c}
            </span>
          ))}
          {parsed?.keywords.length ? <span className="truncate">+ “{parsed.keywords.join(' ')}”</span> : null}
        </div>
      )}

      <Command.List className="flex-1 overflow-y-auto overscroll-contain pb-2">
        {q.length > 0 && (
          <Command.Empty className="px-4 py-10 text-center text-sm text-muted">
            {isFetching ? 'Searching…' : 'No matches. Try a subject, unit or topic.'}
          </Command.Empty>
        )}

        {!q && recent.length > 0 && (
          <Command.Group
            heading={
              <span className="flex items-center justify-between">
                Recent searches
                <button
                  className="normal-case tracking-normal text-subtle hover:text-fg"
                  onClick={() => {
                    clearRecentSearches()
                    setRecent([])
                  }}
                >
                  Clear
                </button>
              </span>
            }
          >
            {recent.map((s) => (
              <Item key={s} value={`recent-${s}`} onSelect={() => go(`/search?q=${encodeURIComponent(s)}`, s)}>
                <IconBox>
                  <Clock />
                </IconBox>
                <span className="truncate">{s}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {showResults && data.items.length > 0 && (
          <Command.Group heading={`Top results · ${data.total}`}>
            {data.items.map((r) => (
              <Item key={r.id} value={`res-${r.id}`} onSelect={() => go(`/resources/${r.id}`, q)}>
                <FileGlyph type={r.resource_type} ext={r.file_ext} className="size-8 rounded-md [&>span]:hidden" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                    {r.recommended && (
                      <span className="shrink-0 rounded border border-accent/20 bg-accent-soft px-1 text-[10px] font-semibold tracking-wide text-accent uppercase">
                        Best
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {r.subject.code} · Unit {r.unit.number} · {r.resource_type_label} · {r.year}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-xs text-subtle tabular sm:flex">
                  <Star className="size-3" /> {formatCount(r.star_count)}
                </span>
              </Item>
            ))}
            <Item value="see-all" onSelect={() => go(`/search?q=${encodeURIComponent(q)}`, q)} className="text-muted">
              <IconBox>
                <Search />
              </IconBox>
              See all results for “{q}”
            </Item>
          </Command.Group>
        )}

        {subjectMatches.length > 0 && (
          <Command.Group heading="Subjects">
            {subjectMatches.slice(0, q ? 3 : 5).map((s) => (
              <Item key={s.id} value={`sub-${s.slug}`} onSelect={() => go(`/subjects/${s.slug}`)}>
                <span className="grid h-7 w-11 shrink-0 place-items-center rounded-md border border-border bg-surface-2 font-mono text-[10px] font-semibold text-muted">
                  {s.code}
                </span>
                <span className="truncate">{s.name}</span>
                <span className="ml-auto pr-5 text-xs text-subtle tabular">{s.resource_count} resources</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {unitMatches.length > 0 && (
          <Command.Group heading="Units">
            {unitMatches.map(({ s, u }) => (
              <Item key={u.id} value={`unit-${u.id}`} onSelect={() => go(`/subjects/${s.slug}?unit=${u.number}`)}>
                <IconBox>
                  <Hash />
                </IconBox>
                <span className="truncate">
                  {s.code} · Unit {u.number} — {u.title}
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {!q && (
          <>
            <Command.Group heading="Browse by type">
              <div className="flex flex-wrap gap-1.5 px-3 pb-1">
                {RESOURCE_TYPES.map((t) => (
                  <Command.Item
                    key={t.value}
                    value={`type-${t.value}`}
                    onSelect={() => go(`/search?type=${t.value}`)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted outline-none data-[selected=true]:border-border-strong data-[selected=true]:text-fg"
                  >
                    <t.icon className="size-3.5" /> {t.label}
                  </Command.Item>
                ))}
              </div>
            </Command.Group>
            <Command.Group heading="Jump to">
              {[
                { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
                { label: 'Upload a document', icon: Upload, to: '/upload' },
                { label: 'Exam mode', icon: Target, to: '/exam' },
                { label: 'Bookmarks', icon: Bookmark, to: '/bookmarks' },
                { label: 'All subjects', icon: BookOpen, to: '/subjects' },
              ].map((x) => (
                <Item key={x.to} value={`nav-${x.to}`} onSelect={() => go(x.to)}>
                  <IconBox>
                    <x.icon />
                  </IconBox>
                  {x.label}
                </Item>
              ))}
            </Command.Group>
          </>
        )}
      </Command.List>

      <div className="hidden items-center justify-between border-t border-border bg-surface/60 px-4 py-2 text-2xs text-subtle sm:flex">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>{' '}
            open
          </span>
        </span>
        <span>Try “dbms unit 3 pyq” or “os deadlock”</span>
      </div>
    </Command>
  )
}
