import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, GraduationCap } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ROMAN, regulationFor, semLabel, useAcademic, useMeta, type Academic } from '@/hooks/useAcademic'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const SEMESTERS: [number, number][] = [1, 2, 3, 4].flatMap((y) => [[y, 1], [y, 2]] as [number, number][])

/** Pick branch / year / semester; the syllabus (regulation) follows from the year. */
export function AcademicPicker<T extends Partial<Academic>>({ value, onChange, branchHeight = 'max-h-48' }: { value: T; onChange: (a: T) => void; branchHeight?: string }) {
  const { data: meta } = useMeta()
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-2xs font-medium tracking-wider text-subtle uppercase">Branch</div>
        <div className={cn(branchHeight, 'space-y-0.5 overflow-y-auto pr-1')}>
          {meta?.branches.map((b) => (
            <button
              key={b.code}
              type="button"
              onClick={() => onChange({ ...value, branch: b.code })}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors', value.branch === b.code ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}
            >
              <span className="w-10 shrink-0 font-mono text-[10px] font-semibold text-subtle">{b.code}</span>
              <span className="truncate">{b.name}</span>
              {value.branch === b.code && <Check className="ml-auto size-3.5 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-2xs font-medium tracking-wider text-subtle uppercase">Year · Semester</div>
        <div className="grid grid-cols-4 gap-1.5">
          {SEMESTERS.map(([y, s]) => (
            <button
              key={`${y}-${s}`}
              type="button"
              onClick={() => onChange({ ...value, year: y, semester: s })}
              className={cn(
                'h-8 rounded-md border font-mono text-xs transition-colors',
                value.year === y && value.semester === s ? 'border-accent/40 bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-fg',
              )}
            >
              {semLabel(y, s)}
            </button>
          ))}
        </div>
        {value.year ? (
          <p className="mt-2 text-2xs text-subtle">
            {ROMAN[value.year]} year follows GRIET's <span className="font-semibold text-muted">{regulationFor(value.year)}</span> syllabus.
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function AcademicSwitcher({ trigger, align = 'start' }: { trigger?: ReactNode; align?: 'start' | 'end' | 'center' }) {
  const { academic, regulation, setAcademic } = useAcademic()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(academic)
  useEffect(() => {
    if (open) setDraft(academic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-left shadow-xs transition-colors hover:border-border-strong">
            <GraduationCap className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">
                {academic.branch} · {semLabel(academic.year, academic.semester)}
              </span>
              <span className="block text-2xs text-subtle">GRIET · {regulation} syllabus</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-subtle" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align={align} sideOffset={6} className="z-50 w-80 rounded-xl border border-border-strong bg-bg-elevated p-4 shadow-lg">
          <AcademicPicker value={draft} onChange={setDraft} />
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                try {
                  await setAcademic(draft)
                  toast.success(`Showing ${draft.branch} · ${semLabel(draft.year, draft.semester)} (${regulationFor(draft.year)})`)
                  setOpen(false)
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              Apply
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const SKIP_KEY = 'sv-onboarding-skipped'

/**
 * Blocks the app for signed-in students who haven't told us their branch / year / semester
 * (accounts created before signup asked). Admins may skip.
 */
export function OnboardingGate() {
  const { user } = useAuth()
  const { isProfileSet, setAcademic } = useAcademic()
  const [draft, setDraft] = useState<Partial<Academic>>({})
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState(() => sessionStorage.getItem(SKIP_KEY) === '1')
  const open = !!user && !isProfileSet && !(user.is_admin && skipped)
  const ready = !!(draft.branch && draft.year && draft.semester)

  const save = async () => {
    if (!ready) return
    setBusy(true)
    try {
      await setAcademic(draft as Academic)
      toast.success(`All set — showing ${draft.branch} ${semLabel(draft.year, draft.semester)} subjects`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={() => {}}
      hideClose
      className="max-w-md"
      title="Which year are you in?"
      description="StudyVault puts the subjects of your current GRIET semester first. You can still search every other year's papers, and change this later."
    >
      <div className="p-5">
        <AcademicPicker value={draft} onChange={setDraft} branchHeight="max-h-44" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface/50 px-5 py-3">
        {user?.is_admin ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.setItem(SKIP_KEY, '1')
              setSkipped(true)
            }}
          >
            Skip (admin)
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" disabled={!ready} loading={busy} onClick={save}>
          Show my subjects
        </Button>
      </div>
    </Dialog>
  )
}
