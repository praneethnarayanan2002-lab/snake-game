import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  label: string
}

/** Pill-shaped filter dropdown; shows the active value and a clear affordance. */
export function FilterMenu({
  label,
  value,
  options,
  onChange,
  align = 'start',
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  align?: 'start' | 'end'
}) {
  const active = options.find((o) => o.value === value)
  return (
    <DropdownMenu.Root>
      <div
        className={cn(
          'inline-flex h-8 shrink-0 items-center rounded-md border text-[13px] transition-colors',
          active ? 'border-accent/30 bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
        )}
      >
        <DropdownMenu.Trigger className="flex h-full items-center gap-1.5 pr-1.5 pl-2.5 outline-none">
          <span className={cn(active && 'text-accent/70')}>{label}</span>
          {active && <span className="max-w-32 truncate font-medium">{active.label}</span>}
          {!active && <ChevronDown className="size-3.5" />}
        </DropdownMenu.Trigger>
        {active && (
          <button onClick={() => onChange('')} className="grid h-full place-items-center pr-2 pl-0.5 hover:text-fg" aria-label={`Clear ${label}`}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="z-50 max-h-80 min-w-48 overflow-y-auto rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-lg">
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              onSelect={() => onChange(o.value === value ? '' : o.value)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
            >
              <Check className={cn('size-3.5 text-accent', o.value !== value && 'invisible')} />
              {o.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
