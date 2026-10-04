import * as Tabs from '@radix-ui/react-tabs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Check, ExternalLink, Flag, Pencil, Plus, Search, ShieldCheck, Trash2, UserX, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Container } from '@/components/layout/AppShell'
import { ConfirmDialog, EditResourceDialog } from '@/components/resource/ResourceDialogs'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { AnimatedNumber, EmptyState } from '@/components/ui/feedback'
import { Badge, Card, Input, Label, PageHeader, Skeleton, Textarea } from '@/components/ui/primitives'
import { useDebounced, useSubjects } from '@/hooks/useData'
import { REPORT_REASONS } from '@/lib/constants'
import type { Resource, Subject, Unit } from '@/lib/types'
import { cn, formatCount, timeAgo } from '@/lib/utils'
import { api } from '@/services/api'

export default function AdminPage() {
  const { data: overview } = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview })
  const [tab, setTab] = useState('reports')
  return (
    <Container>
      <PageHeader eyebrow="Moderation" title="Admin" description="Keep the library clean: review reports, fix metadata and manage the curriculum." />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Resources', v: overview?.resources },
          { label: 'Users', v: overview?.users },
          { label: 'Open reports', v: overview?.open_reports, alert: !!overview?.open_reports },
          { label: 'Total views', v: overview?.views },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tracking-tight', s.alert && 'text-danger')}>{s.v === undefined ? <Skeleton className="h-7 w-12" /> : <AnimatedNumber value={s.v} compact />}</div>
          </Card>
        ))}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-6 flex gap-1 border-b border-border">
          {[
            ['reports', 'Reports'],
            ['resources', 'Resources'],
            ['subjects', 'Subjects & units'],
          ].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className={cn('relative -mb-px px-3 pb-2.5 text-[13px] font-medium transition-colors', tab === v ? 'text-fg' : 'text-muted hover:text-fg')}>
              {l}
              {v === 'reports' && !!overview?.open_reports && <span className="ml-1.5 rounded-full bg-danger/15 px-1.5 text-2xs text-danger tabular">{overview.open_reports}</span>}
              {tab === v && <motion.span layoutId="admin-tab" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="reports">
          <ReportsTab />
        </Tabs.Content>
        <Tabs.Content value="resources">
          <ResourcesTab />
        </Tabs.Content>
        <Tabs.Content value="subjects">
          <SubjectsTab />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  )
}

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r

function ReportsTab() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('open')
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api.admin.reports(status) })
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'purge'; resource: Resource } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })

  const act = async (id: number, s: string) => {
    await api.admin.setReport(id, s)
    toast.success(s === 'resolved' ? 'Marked resolved' : 'Report dismissed')
    refresh()
  }

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {['open', 'resolved', 'dismissed', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn('h-7 rounded-md px-2.5 text-xs font-medium capitalize transition-colors', status === s ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}>
            {s}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !data?.length ? (
        <EmptyState icon={ShieldCheck} title="All clear" description="No reports in this queue." />
      ) : (
        <div className="space-y-2">
          {data.map((rep) => (
            <Card key={rep.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger">
                <Flag className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{rep.resource?.title ?? 'Deleted resource'}</span>
                  <Badge tone="danger">{reasonLabel(rep.reason)}</Badge>
                  {rep.open_reports_for_resource > 1 && <Badge tone="outline">{rep.open_reports_for_resource} open reports</Badge>}
                  {rep.status !== 'open' && <Badge>{rep.status}</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  by @{rep.reporter.username} · {timeAgo(rep.created_at)}
                  {rep.resource && ` · uploaded by @${rep.resource.uploader.username}`}
                  {rep.details && <> · “{rep.details}”</>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rep.resource && (
                  <Link to={`/resources/${rep.resource.id}`} target="_blank">
                    <Button size="sm" variant="ghost">
                      <ExternalLink /> View
                    </Button>
                  </Link>
                )}
                {rep.status === 'open' && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => act(rep.id, 'dismissed')}>
                      <X /> Dismiss
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(rep.id, 'resolved')}>
                      <Check /> Resolve
                    </Button>
                  </>
                )}
                {rep.resource && (
                  <>
                    <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'delete', resource: rep.resource! })}>
                      <Trash2 /> Delete
                    </Button>
                    {rep.reason === 'spam' && (
                      <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'purge', resource: rep.resource! })}>
                        <UserX /> Purge uploader
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm.kind === 'delete' ? 'Delete this resource?' : `Remove all uploads by @${confirm.resource.uploader.username}?`}
          description={confirm.kind === 'delete' ? `“${confirm.resource.title}” and its file will be permanently removed.` : 'Every resource this account uploaded will be deleted. Use for spam accounts.'}
          confirmLabel={confirm.kind === 'delete' ? 'Delete resource' : 'Purge uploads'}
          onConfirm={async () => {
            if (confirm.kind === 'delete') await api.admin.deleteResource(confirm.resource.id)
            else {
              const res = await api.admin.purgeUser(confirm.resource.uploader.id)
              toast.success(`Removed ${res.deleted} uploads`)
            }
            if (confirm.kind === 'delete') toast.success('Resource deleted')
            qc.invalidateQueries()
          }}
        />
      )}
    </div>
  )
}

function ResourcesTab() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'resources', dq], queryFn: () => api.admin.resources(dq) })
  const [editing, setEditing] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState<Resource | null>(null)
  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title…" className="pl-9" />
      </div>
      {isLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-border text-xs text-subtle">
              <tr>
                <th className="px-4 py-2.5 font-medium">Resource</th>
                <th className="px-4 py-2.5 font-medium">Uploader</th>
                <th className="px-4 py-2.5 text-right font-medium">Stars</th>
                <th className="px-4 py-2.5 text-right font-medium">Views</th>
                <th className="px-4 py-2.5 font-medium">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.items.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="max-w-80 px-4 py-2.5">
                    <Link to={`/resources/${r.id}`} className="block truncate font-medium hover:text-accent">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.subject.code} · Unit {r.unit.number} · {r.resource_type_label} · {r.year}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">@{r.uploader.username}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.star_count}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatCount(r.view_count)}</td>
                  <td className="px-4 py-2.5 text-muted">{timeAgo(r.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label="Edit">
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="hover:text-danger" onClick={() => setDeleting(r)} aria-label="Delete">
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {editing && <EditResourceDialog resource={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete this resource?"
          description={`“${deleting.title}” will be permanently removed.`}
          onConfirm={async () => {
            await api.admin.deleteResource(deleting.id)
            toast.success('Resource deleted')
            qc.invalidateQueries()
          }}
        />
      )}
    </div>
  )
}

function SubjectsTab() {
  const { data: subjects } = useSubjects()
  const [editSubject, setEditSubject] = useState<Subject | 'new' | null>(null)
  const [editUnit, setEditUnit] = useState<{ subject: Subject; unit?: Unit } | null>(null)
  const qc = useQueryClient()

  const removeUnit = async (u: Unit) => {
    try {
      await api.admin.deleteUnit(u.id)
      toast.success('Unit removed')
      qc.invalidateQueries({ queryKey: ['subjects'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setEditSubject('new')}>
          <Plus /> New subject
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {subjects?.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">{s.code}</span>
                <div className="mt-2 text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-muted">{s.resource_count} resources</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditSubject(s)}>
                <Pencil /> Edit
              </Button>
            </div>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {s.units.map((u) => (
                <li key={u.id} className="group flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="font-mono text-xs text-subtle">{String(u.number).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate">{u.title}</span>
                  <span className="text-xs text-subtle tabular">{u.resource_count}</span>
                  <button onClick={() => setEditUnit({ subject: s, unit: u })} className="text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg" aria-label="Edit unit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => removeUnit(u)} disabled={u.resource_count > 0} className="text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger disabled:hidden" aria-label="Delete unit">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setEditUnit({ subject: s })} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <Plus className="size-3" /> Add unit
            </button>
          </Card>
        ))}
      </div>
      {editSubject && <SubjectDialog subject={editSubject === 'new' ? null : editSubject} onClose={() => setEditSubject(null)} />}
      {editUnit && <UnitDialog subject={editUnit.subject} unit={editUnit.unit} onClose={() => setEditUnit(null)} />}
    </div>
  )
}

function SubjectDialog({ subject, onClose }: { subject: Subject | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ code: subject?.code ?? '', slug: subject?.slug ?? '', name: subject?.name ?? '', description: subject?.description ?? '', aliases: subject?.aliases ?? '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (subject) await api.admin.updateSubject(subject.id, f)
      else await api.admin.createSubject(f)
      toast.success('Subject saved')
      qc.invalidateQueries({ queryKey: ['subjects'] })
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={subject ? 'Edit subject' : 'New subject'}>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="SE" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="software-engineering" />
          </div>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div>
          <Label>Search aliases (comma separated)</Label>
          <Input value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder="se, software engg" />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Dialog>
  )
}

function UnitDialog({ subject, unit, onClose }: { subject: Subject; unit?: Unit; onClose: () => void }) {
  const qc = useQueryClient()
  const nextNumber = Math.max(0, ...subject.units.map((u) => u.number)) + 1
  const [f, setF] = useState({ number: unit?.number ?? nextNumber, title: unit?.title ?? '', topics: unit?.topics ?? '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (unit) await api.admin.updateUnit(unit.id, f)
      else await api.admin.addUnit(subject.id, f)
      toast.success('Unit saved')
      qc.invalidateQueries({ queryKey: ['subjects'] })
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${unit ? 'Edit' : 'Add'} unit · ${subject.code}`}>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <div>
            <Label>Number</Label>
            <Input type="number" min={1} max={12} value={f.number} onChange={(e) => setF({ ...f, number: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Topics</Label>
          <Textarea value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} placeholder="Comma-separated topics" />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Dialog>
  )
}
