import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, FileText, Maximize2, Minimize2, Minus, Plus, Search, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { Tooltip } from '@/components/ui/primitives'
import { FILE_KIND_META } from '@/lib/constants'
import type { Resource } from '@/lib/types'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

// Microsoft's viewer renders Word/PowerPoint/Excel/OpenDocument from a public URL.
const OFFICE_EXTS = new Set(['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'odp', 'ods'])
const officeEmbed = (url: string) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`

type Tab = 'original' | 'text'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** Highlights matches of `query` and reports how many there are. */
function Highlighted({ text, query, current, onCount }: { text: string; query: string; current: number; onCount: (n: number) => void }) {
  const parts = useMemo(() => (query.length >= 2 ? text.split(new RegExp(`(${escapeRe(query)})`, 'gi')) : [text]), [text, query])
  const count = Math.floor(parts.length / 2)
  useEffect(() => onCount(count), [count, onCount])
  let idx = -1
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>
        idx++
        return (
          <mark key={i} data-match={idx} className={cn('rounded-sm text-inherit', idx === current ? 'bg-orange-400/70' : 'bg-yellow-300/50')}>
            {p}
          </mark>
        )
      })}
    </>
  )
}

export function DocumentViewer({ resource: r, url, downloadUrl }: { resource: Resource; url: string; downloadUrl: string }) {
  const canOffice = OFFICE_EXTS.has(r.file_ext) && !!r.public_file_url
  const inlineText = r.file_type === 'text' || r.file_ext === 'csv'
  const hasOriginal = r.file_type === 'image' || inlineText || canOffice
  const [tab, setTab] = useState<Tab>(hasOriginal ? 'original' : 'text')
  const [fullscreen, setFullscreen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [current, setCurrent] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rawFile = useQuery({
    queryKey: ['file-text', r.id],
    queryFn: async () => (await fetch(url)).text(),
    enabled: inlineText,
    staleTime: Infinity,
  })
  const extracted = useQuery({ queryKey: ['doc-text', r.id], queryFn: () => api.documentText(r.id), enabled: tab === 'text', staleTime: Infinity })

  useEffect(() => setCurrent(0), [query])
  useEffect(() => {
    scrollRef.current?.querySelector(`[data-match="${current}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current, matchCount, query])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fullscreen && setFullscreen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const searchable = tab === 'text' || (tab === 'original' && inlineText)
  const step = (d: 1 | -1) => matchCount && setCurrent((c) => (c + d + matchCount) % matchCount)

  let body: ReactNode
  if (tab === 'text') {
    body = extracted.isLoading ? (
      <Centered><Spinner /></Centered>
    ) : extracted.data?.text ? (
      <article className="mx-auto max-w-3xl px-5 py-6 text-[14px] leading-relaxed whitespace-pre-wrap text-fg sm:px-8">
        <Highlighted text={extracted.data.text} query={query} current={current} onCount={setMatchCount} />
        {extracted.data.truncated && <p className="mt-6 text-xs text-subtle">Preview truncated — download the file for the full text.</p>}
      </article>
    ) : (
      <Centered>
        <FileText className="mb-3 size-6 text-subtle" />
        <p>No text could be extracted from this file.</p>
        <a href={downloadUrl} className="mt-2 text-accent hover:underline">Download to open it</a>
      </Centered>
    )
  } else if (r.file_type === 'image') {
    body = (
      <div className="grid min-h-full place-items-center bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,var(--surface)_0%_50%)] bg-[length:24px_24px] p-4">
        <img src={url} alt={r.title} style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none' }} className="rounded shadow-md" />
      </div>
    )
  } else if (inlineText) {
    body = rawFile.isLoading ? (
      <Centered><Spinner /></Centered>
    ) : r.file_ext === 'csv' ? (
      <CsvTable rows={parseCsv(rawFile.data ?? '')} query={query} />
    ) : (
      <pre className="mx-auto max-w-3xl px-5 py-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-fg sm:px-8">
        <Highlighted text={rawFile.data ?? ''} query={query} current={current} onCount={setMatchCount} />
      </pre>
    )
  } else {
    body = <iframe title={r.title} src={officeEmbed(r.public_file_url!)} className="h-full w-full border-0 bg-white" />
  }

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden border-border bg-surface-2', fullscreen ? 'fixed inset-0 z-[60]' : 'h-full rounded-xl border')}>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-bg-elevated/90 px-2 backdrop-blur">
        <span className="ml-1 rounded border border-border bg-surface px-1.5 font-mono text-[10px] font-semibold text-muted uppercase">{r.file_ext}</span>
        {r.page_count > 0 && FILE_KIND_META[r.file_type].unit && (
          <span className="ml-1 hidden text-xs text-muted sm:inline">
            {r.page_count} {FILE_KIND_META[r.file_type].unit}
          </span>
        )}
        {hasOriginal && r.file_type !== 'text' && r.file_type !== 'image' && (
          <div className="ml-2 flex rounded-md border border-border bg-surface p-0.5">
            {(['original', 'text'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn('h-6 rounded-[5px] px-2 text-xs font-medium capitalize', tab === t ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
                {t === 'original' ? 'Preview' : 'Text'}
              </button>
            ))}
          </div>
        )}
        {r.file_type === 'image' && tab === 'original' && (
          <div className="ml-1 hidden items-center sm:flex">
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} aria-label="Zoom out"><Minus /></Button>
            <button onClick={() => setZoom(1)} className="min-w-12 text-xs text-muted tabular hover:text-fg">{Math.round(zoom * 100)}%</button>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in"><Plus /></Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {searchable &&
            (searchOpen ? (
              <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-surface pr-1 pl-2">
                <Search className="size-3.5 shrink-0 text-subtle" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
                    if (e.key === 'Escape') {
                      setQuery('')
                      setSearchOpen(false)
                    }
                  }}
                  placeholder="Find in file"
                  className="w-24 bg-transparent text-xs outline-none placeholder:text-subtle sm:w-36"
                />
                <span className="shrink-0 text-2xs text-subtle tabular">{query.length >= 2 ? (matchCount ? `${current + 1}/${matchCount}` : '0') : ''}</span>
                <button onClick={() => step(-1)} className="p-0.5 text-subtle hover:text-fg" aria-label="Previous match"><ChevronUp className="size-3.5" /></button>
                <button onClick={() => step(1)} className="p-0.5 text-subtle hover:text-fg" aria-label="Next match"><ChevronDown className="size-3.5" /></button>
                <button onClick={() => { setQuery(''); setSearchOpen(false) }} className="p-0.5 text-subtle hover:text-fg" aria-label="Close search"><X className="size-3.5" /></button>
              </div>
            ) : (
              <Tooltip content="Find in file">
                <Button variant="ghost" size="icon-sm" onClick={() => setSearchOpen(true)} aria-label="Search in file"><Search /></Button>
              </Tooltip>
            ))}
          <Tooltip content="Download">
            <a href={downloadUrl} className="hidden sm:inline-flex">
              <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-label="Download"><Download /></Button>
            </a>
          </Tooltip>
          <Tooltip content={fullscreen ? 'Exit focus mode' : 'Focus mode'}>
            <Button variant="ghost" size="icon-sm" onClick={() => setFullscreen((f) => !f)} aria-label="Toggle focus mode">{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button>
          </Tooltip>
        </div>
      </div>
      {!hasOriginal && tab === 'text' && OFFICE_EXTS.has(r.file_ext) && (
        <div className="border-b border-border bg-surface px-4 py-2 text-xs text-muted">
          Showing extracted text. The formatted preview appears when files are served from public storage (e.g. the deployed site) — or download the original.
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-bg-elevated">
        {body}
      </div>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-60 flex-col items-center justify-center p-8 text-center text-sm text-muted">{children}</div>
}

function CsvTable({ rows, query }: { rows: string[][]; query: string }) {
  const q = query.length >= 2 ? query.toLowerCase() : ''
  const [head, ...rest] = rows
  if (!head) return <Centered>Empty CSV file.</Centered>
  return (
    <div className="p-4">
      <table className="w-full border-collapse overflow-hidden rounded-lg border border-border text-left text-[13px]">
        <thead className="bg-surface-2">
          <tr>{head.map((h, i) => <th key={i} className="border-b border-border px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rest.map((row, i) => (
            <tr key={i} className={cn(q && row.some((c) => c.toLowerCase().includes(q)) && 'bg-yellow-300/20')}>
              {row.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
