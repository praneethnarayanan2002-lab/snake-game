import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, CloudUpload, FileText, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Container } from '@/components/layout/AppShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/primitives'
import { useSubjects } from '@/hooks/useData'
import { EXAM_RESOURCE_TYPES, EXAM_TYPES, MAX_UPLOAD_MB, RESOURCE_TYPES, SUPPORTED_FORMATS_LABEL, TYPE_BY_VALUE, UPLOAD_ACCEPT, YEARS } from '@/lib/constants'
import type { Resource, ResourceType } from '@/lib/types'
import { cn, formatBytes, pad2 } from '@/lib/utils'
import { api } from '@/services/api'

const STEPS = ['File', 'Subject', 'Unit', 'Type', 'Year', 'Publish'] as const

interface Draft {
  file: File | null
  subjectId: number | null
  unitId: number | null
  type: ResourceType | null
  year: number | null
  examType: string
  title: string
  description: string
  tags: string[]
}

export default function UploadPage() {
  const { data: subjects } = useSubjects()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [draft, setDraft] = useState<Draft>({ file: null, subjectId: null, unitId: null, type: null, year: null, examType: '', title: '', description: '', tags: [] })
  const [titleTouched, setTitleTouched] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState<Resource | null>(null)
  const [error, setError] = useState<string | null>(null)

  const subject = subjects?.find((s) => s.id === draft.subjectId)
  const unit = subject?.units.find((u) => u.id === draft.unitId)
  const needsExam = !!draft.type && EXAM_RESOURCE_TYPES.includes(draft.type)

  // Deep links like /upload?subject=dbms&unit=3 from empty states.
  useEffect(() => {
    if (!subjects || draft.subjectId) return
    const s = subjects.find((x) => x.slug === params.get('subject'))
    if (!s) return
    const u = s.units.find((x) => x.number === Number(params.get('unit')))
    setDraft((d) => ({ ...d, subjectId: s.id, unitId: u?.id ?? null }))
  }, [subjects, params, draft.subjectId])

  const suggestedTitle = useMemo(() => {
    if (!subject || !unit || !draft.type) return ''
    const t = TYPE_BY_VALUE[draft.type]
    if (draft.type === 'semester' || draft.type === 'mid') return `${subject.code} ${t.label.replace(/s$/, '')} ${draft.year ?? ''}`.trim()
    return `${subject.code} Unit ${unit.number} ${t.short === 'PYQ' ? 'Previous Year Questions' : t.label.replace(/s$/, '')} — ${unit.title}`
  }, [subject, unit, draft.type, draft.year])

  useEffect(() => {
    if (!titleTouched && suggestedTitle) setDraft((d) => ({ ...d, title: suggestedTitle }))
  }, [suggestedTitle, titleTouched])

  const suggestedTags = useMemo(() => {
    const out = new Set<string>()
    if (subject) out.add(subject.code.toLowerCase())
    if (unit) {
      out.add(`unit ${unit.number}`)
      unit.topics.split(',').slice(0, 4).forEach((t) => t.trim() && out.add(t.trim().toLowerCase()))
    }
    if (draft.type) out.add(TYPE_BY_VALUE[draft.type].short.toLowerCase())
    return [...out].filter((t) => !draft.tags.includes(t))
  }, [subject, unit, draft.type, draft.tags])

  const canNext = [
    !!draft.file,
    !!draft.subjectId,
    !!draft.unitId,
    !!draft.type,
    !!draft.year,
    draft.title.trim().length >= 3 && draft.description.trim().length > 0 && draft.tags.length > 0,
  ][step]

  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const next = () => canNext && step < STEPS.length - 1 && go(step + 1)

  // Single-choice steps advance automatically for a snappier flow.
  const pick = (patch: Partial<Draft>, advance = true) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (advance) setTimeout(() => go(step + 1), 160)
  }

  const onDrop = (accepted: File[], rejected: FileRejection[]) => {
    setError(null)
    if (rejected.length) {
      const code = rejected[0].errors[0]?.code
      setError(code === 'file-too-large' ? `That file is over ${MAX_UPLOAD_MB} MB.` : `That file type isn't supported. Use ${SUPPORTED_FORMATS_LABEL}.`)
      return
    }
    const file = accepted[0]
    if (!file) return
    setDraft((d) => ({ ...d, file }))
    setTimeout(() => go(1), 350)
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: UPLOAD_ACCEPT,
    maxSize: MAX_UPLOAD_MB * 1024 * 1024,
    multiple: false,
  })

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, '')
    if (t && !draft.tags.includes(t) && draft.tags.length < 12) setDraft((d) => ({ ...d, tags: [...d.tags, t] }))
    setTagInput('')
  }

  const publish = async () => {
    if (!draft.file || !draft.subjectId || !draft.unitId || !draft.type || !draft.year) return
    setError(null)
    setProgress(0)
    try {
      const res = await api.upload(
        {
          file: draft.file,
          title: draft.title.trim(),
          subject_id: draft.subjectId,
          unit_id: draft.unitId,
          resource_type: draft.type,
          year: draft.year,
          exam_type: needsExam ? draft.examType || undefined : undefined,
          description: draft.description.trim(),
          tags: draft.tags.join(','),
        },
        setProgress,
      )
      setProgress(100)
      qc.invalidateQueries()
      setTimeout(() => setDone(res), 400)
    } catch (e) {
      setProgress(null)
      setError((e as Error).message)
      toast.error((e as Error).message)
    }
  }

  const reset = () => {
    setDraft({ file: null, subjectId: null, unitId: null, type: null, year: null, examType: '', title: '', description: '', tags: [] })
    setTitleTouched(false)
    setProgress(null)
    setDone(null)
    setError(null)
    go(0)
  }

  if (done) return <UploadSuccess resource={done} onAnother={reset} />

  return (
    <Container className="max-w-3xl">
      <div className="mb-8">
        <div className="mb-2 text-xs font-medium text-subtle">Share with your batch</div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">Upload a document</h1>
        <p className="mt-1.5 text-sm text-muted">Six quick steps. Once published, it's in the public library instantly.</p>
      </div>

      {/* Stepper */}
      <ol className="mb-8 grid grid-cols-6 gap-1.5">
        {STEPS.map((label, i) => {
          const complete = i < step
          const current = i === step
          return (
            <li key={label}>
              <button onClick={() => i < step && go(i)} disabled={i > step} className="group w-full text-left disabled:cursor-default">
                <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full bg-accent" initial={false} animate={{ width: complete ? '100%' : current ? '50%' : '0%' }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} />
                </div>
                <div className={cn('mt-2 flex items-center gap-1 text-[11px] font-medium sm:text-xs', current ? 'text-fg' : complete ? 'text-muted group-hover:text-fg' : 'text-subtle')}>
                  {complete && <Check className="hidden size-3 text-accent sm:block" />}
                  {label}
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Selection summary */}
      {step > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5 flex flex-wrap items-center gap-1.5 text-xs">
          {draft.file && (
            <Chip onClick={() => go(0)}>
              <FileText className="size-3" /> <span className="max-w-40 truncate">{draft.file.name}</span>
            </Chip>
          )}
          {subject && step > 1 && <Chip onClick={() => go(1)}>{subject.code}</Chip>}
          {unit && step > 2 && <Chip onClick={() => go(2)}>Unit {unit.number}</Chip>}
          {draft.type && step > 3 && <Chip onClick={() => go(3)}>{TYPE_BY_VALUE[draft.type].label}</Chip>}
          {draft.year && step > 4 && <Chip onClick={() => go(4)}>{draft.year}</Chip>}
        </motion.div>
      )}

      <div className="relative min-h-[360px]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <div>
                <div
                  {...getRootProps()}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all duration-200',
                    isDragActive ? 'scale-[1.01] border-accent bg-accent-soft' : 'border-border-strong bg-surface hover:border-accent/50 hover:bg-surface-2/50',
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 mask-fade-b" />
                  <motion.div animate={isDragActive ? { y: -6, scale: 1.06 } : { y: 0, scale: 1 }} className="relative mb-5 grid size-14 place-items-center rounded-2xl border border-border bg-bg-elevated shadow-md">
                    <CloudUpload className={cn('size-6', isDragActive ? 'text-accent' : 'text-muted')} />
                  </motion.div>
                  <p className="relative text-base font-semibold tracking-tight">{isDragActive ? 'Release to upload' : 'Drop your file here'}</p>
                  <p className="relative mt-1 text-sm text-muted">
                    or <span className="font-medium text-accent">click to browse</span>
                  </p>
                  <p className="relative mt-5 max-w-md text-xs text-subtle">PDF • Word • PowerPoint • Excel • OpenDocument • TXT/MD/CSV • Images — max {MAX_UPLOAD_MB}MB</p>
                </div>
                {draft.file && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-surface-2">
                      <FileText className="size-5 text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{draft.file.name}</div>
                      <div className="text-xs text-muted">{formatBytes(draft.file.size)}</div>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDraft((d) => ({ ...d, file: null }))} aria-label="Remove file">
                      <X />
                    </Button>
                  </motion.div>
                )}
              </div>
            )}

            {step === 1 && (
              <StepTitle title="Which subject is this for?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {subjects?.map((s) => (
                    <Choice key={s.id} selected={draft.subjectId === s.id} onClick={() => pick({ subjectId: s.id, unitId: s.id === draft.subjectId ? draft.unitId : null })}>
                      <span className="w-12 font-mono text-xs font-semibold text-subtle">{s.code}</span>
                      <span className="font-medium">{s.name}</span>
                    </Choice>
                  ))}
                </div>
              </StepTitle>
            )}

            {step === 2 && subject && (
              <StepTitle title={`Which unit of ${subject.code}?`}>
                <div className="grid gap-2">
                  {subject.units.map((u) => (
                    <Choice key={u.id} selected={draft.unitId === u.id} onClick={() => pick({ unitId: u.id })}>
                      <span className="w-8 font-mono text-xs text-subtle">{pad2(u.number)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{u.title}</span>
                        <span className="block truncate text-xs text-muted">{u.topics}</span>
                      </span>
                    </Choice>
                  ))}
                </div>
              </StepTitle>
            )}

            {step === 3 && (
              <StepTitle title="What kind of resource is it?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {RESOURCE_TYPES.map((t) => (
                    <Choice key={t.value} selected={draft.type === t.value} onClick={() => pick({ type: t.value })}>
                      <span className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2">
                        <t.icon className="size-4 text-muted" />
                      </span>
                      <span>
                        <span className="block font-medium">{t.label}</span>
                        <span className="block text-xs text-muted">{t.hint}</span>
                      </span>
                    </Choice>
                  ))}
                </div>
              </StepTitle>
            )}

            {step === 4 && (
              <StepTitle title="Which year is it from?">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {YEARS.map((y) => (
                    <Choice key={y} selected={draft.year === y} onClick={() => pick({ year: y }, !needsExam)} className="justify-center">
                      <span className="font-medium tabular">{y}</span>
                    </Choice>
                  ))}
                </div>
                {needsExam && (
                  <div className="mt-6">
                    <Label>
                      Exam type <span className="font-normal text-subtle">(if applicable)</span>
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {EXAM_TYPES.map((e) => (
                        <button
                          key={e.value}
                          onClick={() => setDraft((d) => ({ ...d, examType: d.examType === e.value ? '' : e.value }))}
                          className={cn(
                            'h-8 rounded-md border px-3 text-[13px] transition-colors',
                            draft.examType === e.value ? 'border-accent/40 bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-fg',
                          )}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </StepTitle>
            )}

            {step === 5 && (
              <StepTitle title="Final details">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={draft.title}
                      onChange={(e) => {
                        setTitleTouched(true)
                        setDraft((d) => ({ ...d, title: e.target.value }))
                      }}
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <Label htmlFor="desc">Description</Label>
                    <Textarea
                      id="desc"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="What's inside? Which topics, which exam, handwritten or typed…"
                      maxLength={4000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
                      {draft.tags.map((t) => (
                        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-xs">
                          {t}
                          <button onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))} className="text-subtle hover:text-fg" aria-label={`Remove ${t}`}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        id="tags"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault()
                            addTag(tagInput)
                          } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) {
                            setDraft((d) => ({ ...d, tags: d.tags.slice(0, -1) }))
                          }
                        }}
                        onBlur={() => tagInput && addTag(tagInput)}
                        placeholder={draft.tags.length ? '' : 'Type and press Enter'}
                        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
                      />
                    </div>
                    {suggestedTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-xs text-subtle">Suggested:</span>
                        {suggestedTags.slice(0, 6).map((t) => (
                          <button key={t} onClick={() => addTag(t)} className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 text-xs text-muted hover:border-accent/50 hover:text-fg">
                            <Plus className="size-3" /> {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {progress !== null && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 overflow-hidden">
                      <div className="rounded-xl border border-border bg-surface p-4">
                        <div className="mb-2 flex items-center justify-between text-[13px]">
                          <span className="font-medium">{progress < 100 ? 'Uploading…' : 'Processing file & extracting text…'}</span>
                          <span className="text-muted tabular">{progress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <motion.div className="relative h-full overflow-hidden rounded-full bg-accent" animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.3 }}>
                            <motion.div
                              className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                              animate={{ x: ['-100%', '250%'] }}
                              transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                            />
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </StepTitle>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && <p className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
        <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0 || progress !== null}>
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={next} disabled={!canNext}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button variant="primary" onClick={publish} disabled={!canNext} loading={progress !== null}>
            Publish to library
          </Button>
        )}
      </div>
    </Container>
  )
}

function StepTitle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-[17px] font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  )
}

function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-[border-color,background-color,box-shadow] duration-150',
        selected ? 'border-accent/50 bg-accent-soft ring-4 ring-accent/10' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/50',
        className,
      )}
    >
      {children}
      {selected && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 right-2 grid size-4 place-items-center rounded-full bg-accent text-accent-fg">
          <Check className="size-2.5" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  )
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface px-2 text-muted transition-colors hover:border-border-strong hover:text-fg">
      {children}
    </button>
  )
}

function UploadSuccess({ resource, onAnother }: { resource: Resource; onAnother: () => void }) {
  return (
    <Container className="max-w-xl">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 mask-fade-b" />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative mx-auto mb-6 grid size-16 place-items-center rounded-full bg-success/12 ring-8 ring-success/5">
          <svg viewBox="0 0 24 24" className="size-8 text-success" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.45, ease: 'easeOut' }} />
          </svg>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="relative text-xl font-semibold tracking-tight">
          ✓ Upload successful
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="relative mt-2 text-sm text-muted">
          Your resource is now available in the public library.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }} className="relative mt-6 rounded-xl border border-border bg-bg-elevated p-4 text-left">
          <div className="text-sm font-semibold">{resource.title}</div>
          <div className="mt-1 text-xs text-muted">
            {resource.subject.code} · Unit {resource.unit.number} · {resource.resource_type_label} · {resource.year} · {resource.file_ext.toUpperCase()}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="relative mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to={`/resources/${resource.id}`} className={buttonVariants({ variant: 'primary' })}>
            View resource <ArrowRight />
          </Link>
          <Button onClick={onAnother}>
            <RotateCcw /> Upload another
          </Button>
        </motion.div>
      </motion.div>
    </Container>
  )
}
