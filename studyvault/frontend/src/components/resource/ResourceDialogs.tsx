import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/primitives'
import { useSubjects } from '@/hooks/useData'
import { EXAM_RESOURCE_TYPES, EXAM_TYPES, REPORT_REASONS, RESOURCE_TYPES, YEARS } from '@/lib/constants'
import type { Resource } from '@/lib/types'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

export function ReportDialog({ resource, open, onOpenChange, onReported }: { resource: Resource; open: boolean; onOpenChange: (o: boolean) => void; onReported: () => void }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await api.report(resource.id, reason, details)
      toast.success('Thanks — a moderator will review this resource.')
      onReported()
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Report resource" description="Help keep the library useful. Reports are anonymous to the uploader.">
      <div className="space-y-2 p-5">
        <div className="grid gap-1.5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors',
                reason === r.value ? 'border-accent/40 bg-accent-soft text-fg' : 'border-border hover:border-border-strong',
              )}
            >
              <span className={cn('grid size-4 place-items-center rounded-full border', reason === r.value ? 'border-accent' : 'border-border-strong')}>
                {reason === r.value && <span className="size-2 rounded-full bg-accent" />}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything else? (optional)" className="mt-2 min-h-20" maxLength={1000} />
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface/50 px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!reason} loading={busy} onClick={submit}>
          Submit report
        </Button>
      </div>
    </Dialog>
  )
}

export function EditResourceDialog({ resource, open, onOpenChange, onSaved }: { resource: Resource; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (r: Resource) => void }) {
  const { data: subjects } = useSubjects()
  const qc = useQueryClient()
  const [form, setForm] = useState(() => toForm(resource))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setForm(toForm(resource))
  }, [open, resource])
  const subject = subjects?.find((s) => s.id === form.subject_id)

  const save = async () => {
    setBusy(true)
    try {
      const updated = await api.updateResource(resource.id, {
        ...form,
        exam_type: EXAM_RESOURCE_TYPES.includes(form.resource_type as Resource['resource_type']) ? form.exam_type || null : null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      toast.success('Resource updated')
      qc.invalidateQueries()
      onSaved?.(updated)
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const select = 'h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-accent'
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit resource" className="max-w-lg">
      <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
        <div>
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Subject</Label>
            <select
              className={select}
              value={form.subject_id}
              onChange={(e) => {
                const s = subjects?.find((x) => x.id === Number(e.target.value))
                setForm({ ...form, subject_id: Number(e.target.value), unit_id: s?.units[0]?.id ?? form.unit_id })
              }}
            >
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Unit</Label>
            <select className={select} value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: Number(e.target.value) })}>
              {subject?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.number} — {u.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Type</Label>
            <select className={select} value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })}>
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Year</Label>
            <select className={select} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}>
              {[...new Set([form.year, ...YEARS])].sort((a, b) => b - a).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          {EXAM_RESOURCE_TYPES.includes(form.resource_type as Resource['resource_type']) && (
            <div className="col-span-2">
              <Label>Exam type</Label>
              <select className={select} value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
                <option value="">Not specified</option>
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Tags (comma separated)</Label>
          <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface/50 px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save changes
        </Button>
      </div>
    </Dialog>
  )
}

function toForm(r: Resource) {
  return {
    title: r.title,
    description: r.description,
    subject_id: r.subject.id,
    unit_id: r.unit.id,
    resource_type: r.resource_type as string,
    year: r.year,
    exam_type: r.exam_type ?? '',
    tags: r.tags.join(', '),
  }
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} className="max-w-sm">
      <div className="mt-5 flex justify-end gap-2 border-t border-border bg-surface/50 px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
              onOpenChange(false)
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
