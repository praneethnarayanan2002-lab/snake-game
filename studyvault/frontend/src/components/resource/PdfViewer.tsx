import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Maximize2, Minimize2, Minus, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { Button } from '@/components/ui/button'
import { Skeleton, Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PdfDoc = Parameters<NonNullable<React.ComponentProps<typeof Document>['onLoadSuccess']>>[0]

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Mounts the (expensive) page canvas only when it's near the viewport. */
function LazyPage({
  pageNumber,
  width,
  aspect,
  query,
  onVisible,
  registerRef,
}: {
  pageNumber: number
  width: number
  aspect: number
  query: string
  onVisible: (n: number) => void
  registerRef: (n: number, el: HTMLDivElement | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(pageNumber <= 2)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nearObs = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '1200px 0px' })
    const visObs = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(pageNumber), { threshold: 0.5 })
    nearObs.observe(el)
    visObs.observe(el)
    return () => {
      nearObs.disconnect()
      visObs.disconnect()
    }
  }, [pageNumber, onVisible])

  const renderer = useCallback(
    ({ str }: { str: string }) => {
      if (!query) return escapeHtml(str)
      return escapeHtml(str).replace(new RegExp(escapeRe(escapeHtml(query)), 'gi'), (m) => `<mark>${m}</mark>`)
    },
    [query],
  )

  return (
    <div
      ref={(el) => {
        ref.current = el
        registerRef(pageNumber, el)
      }}
      data-page={pageNumber}
      className="relative mx-auto overflow-hidden rounded-[4px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_24px_-8px_rgb(0_0_0/0.25)]"
      style={{ width, height: width * aspect }}
    >
      {near && (
        <Page
          pageNumber={pageNumber}
          width={width}
          customTextRenderer={renderer}
          renderAnnotationLayer={false}
          loading={<Skeleton className="absolute inset-0 rounded-none bg-white" />}
        />
      )}
    </div>
  )
}

export function PdfViewer({
  url,
  downloadUrl,
  initialPage = 1,
  onPageChange,
}: {
  url: string
  downloadUrl: string
  initialPage?: number
  onPageChange?: (page: number) => void
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [aspect, setAspect] = useState(1.414)
  const [page, setPage] = useState(initialPage)
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageEls = useRef(new Map<number, HTMLDivElement>())

  // In-document search
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pageTexts, setPageTexts] = useState<string[] | null>(null)
  const [matchIdx, setMatchIdx] = useState(0)
  const searchInput = useRef<HTMLInputElement>(null)

  const pageWidth = Math.max(240, Math.min(frameWidth - (frameWidth < 640 ? 16 : 48), 860) * zoom)

  const onLoad = useCallback(async (pdf: PdfDoc) => {
    setDoc(pdf)
    setNumPages(pdf.numPages)
    const first = await pdf.getPage(1)
    const vp = first.getViewport({ scale: 1 })
    setAspect(vp.height / vp.width)
  }, [])

  const scrollToPage = useCallback((n: number, smooth = true) => {
    const el = pageEls.current.get(n)
    const container = scrollRef.current
    if (el && container) container.scrollTo({ top: el.offsetTop - 16, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Resume position once layout is known.
  const resumed = useRef(false)
  useEffect(() => {
    if (!resumed.current && numPages && frameWidth && initialPage > 1) {
      resumed.current = true
      requestAnimationFrame(() => scrollToPage(Math.min(initialPage, numPages), false))
    }
  }, [numPages, frameWidth, initialPage, scrollToPage])

  const onVisible = useCallback(
    (n: number) => {
      setPage(n)
      onPageChange?.(n)
    },
    [onPageChange],
  )
  const registerRef = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(n, el)
    else pageEls.current.delete(n)
  }, [])

  // Lazily extract text the first time search is used.
  useEffect(() => {
    if (!searchOpen || !doc || pageTexts) return
    let cancelled = false
    ;(async () => {
      const texts: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i)
        const content = await p.getTextContent()
        texts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
      }
      if (!cancelled) setPageTexts(texts)
    })()
    return () => {
      cancelled = true
    }
  }, [searchOpen, doc, pageTexts])

  const matches = useMemo(() => {
    if (!query || query.length < 2 || !pageTexts) return []
    const re = new RegExp(escapeRe(query), 'gi')
    return pageTexts.flatMap((t, i) => Array.from(t.matchAll(re), () => i + 1))
  }, [query, pageTexts])

  useEffect(() => {
    setMatchIdx(0)
  }, [query])
  useEffect(() => {
    if (matches.length) scrollToPage(matches[matchIdx])
  }, [matchIdx, matches, scrollToPage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInput.current?.focus(), 0)
      }
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const step = (dir: 1 | -1) => matches.length && setMatchIdx((i) => (i + dir + matches.length) % matches.length)

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden border-border bg-surface-2', fullscreen ? 'fixed inset-0 z-[60]' : 'h-full rounded-xl border')}>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-bg-elevated/90 px-2 backdrop-blur">
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => scrollToPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="min-w-16 text-center text-xs text-muted tabular">
            {numPages ? (
              <>
                <span className="text-fg">{page}</span> / {numPages}
              </>
            ) : (
              '–'
            )}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => scrollToPage(Math.min(numPages, page + 1))} disabled={page >= numPages} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="hidden items-center sm:flex">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="Zoom out">
            <Minus />
          </Button>
          <button onClick={() => setZoom(1)} className="min-w-12 text-xs text-muted tabular hover:text-fg">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Zoom in">
            <Plus />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center overflow-hidden"
              >
                <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-surface pr-1 pl-2">
                  <Search className="size-3.5 shrink-0 text-subtle" />
                  <input
                    ref={searchInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
                      if (e.key === 'Escape') {
                        setQuery('')
                        setSearchOpen(false)
                      }
                    }}
                    placeholder="Find in PDF"
                    className="w-24 bg-transparent text-xs outline-none placeholder:text-subtle sm:w-36"
                    autoFocus
                  />
                  <span className="shrink-0 text-2xs text-subtle tabular">
                    {query.length >= 2 ? (pageTexts ? (matches.length ? `${matchIdx + 1}/${matches.length}` : '0') : '…') : ''}
                  </span>
                  <button onClick={() => step(-1)} className="p-0.5 text-subtle hover:text-fg" aria-label="Previous match">
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button onClick={() => step(1)} className="p-0.5 text-subtle hover:text-fg" aria-label="Next match">
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setQuery('')
                      setSearchOpen(false)
                    }}
                    className="p-0.5 text-subtle hover:text-fg"
                    aria-label="Close search"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!searchOpen && (
            <Tooltip content="Search in PDF (⌘F)">
              <Button variant="ghost" size="icon-sm" onClick={() => setSearchOpen(true)} aria-label="Search in PDF">
                <Search />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Download">
            <a href={downloadUrl} className="hidden sm:inline-flex">
              <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-label="Download">
                <Download />
              </Button>
            </a>
          </Tooltip>
          <Tooltip content={fullscreen ? 'Exit focus mode' : 'Focus mode'}>
            <Button variant="ghost" size="icon-sm" onClick={() => setFullscreen((f) => !f)} aria-label="Toggle focus mode">
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Pages */}
      <div ref={frameRef} className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="absolute inset-0 overflow-auto overscroll-contain">
          {error ? (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
              <div>
                <p>{error}</p>
                <a href={downloadUrl} className="mt-3 inline-block text-accent underline-offset-4 hover:underline">
                  Download the PDF instead
                </a>
              </div>
            </div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onLoad}
              onLoadError={() => setError('This PDF could not be displayed in the browser.')}
              loading={
                <div className="space-y-4 p-6">
                  <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[860px] rounded-[4px]" />
                </div>
              }
              className="space-y-4 px-2 py-4 sm:px-6 sm:py-6"
            >
              {frameWidth > 0 &&
                Array.from({ length: numPages }, (_, i) => (
                  <LazyPage key={i + 1} pageNumber={i + 1} width={pageWidth} aspect={aspect} query={query.length >= 2 ? query : ''} onVisible={onVisible} registerRef={registerRef} />
                ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  )
}
