import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Bookmark,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Search,
  Shield,
  Sun,
  Target,
  Upload,
  User,
  FolderUp,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Kbd } from '@/components/ui/primitives'
import { useSubjects } from '@/hooks/useData'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useCommandPalette } from './CommandPalette'

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)}>
      <span className="relative grid size-7 place-items-center rounded-lg bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_8px_-2px_var(--accent-ring)]">
        <svg viewBox="0 0 32 32" className="size-4">
          <path d="M8 9.5C8 8.7 8.7 8 9.5 8H16v16H9.5C8.7 24 8 23.3 8 22.5v-13Z" fill="#fff" opacity=".55" />
          <path d="M16 8h6.5c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5H16V8Z" fill="#fff" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">StudyVault</span>
    </Link>
  )
}

const NAV: { to: string; label: string; icon: LucideIcon; auth?: boolean; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
  { to: '/my-uploads', label: 'My Uploads', icon: FolderUp },
  { to: '/exam', label: 'Exam Mode', icon: Target },
]

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className="group relative block">
      {({ isActive }) => (
        <span
          className={cn(
            'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150',
            isActive ? 'text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-md border border-border bg-surface-2"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <Icon className={cn('relative size-4', isActive ? 'text-accent' : 'text-subtle group-hover:text-muted')} />
          <span className="relative">{label}</span>
        </span>
      )}
    </NavLink>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} className={className} aria-label="Toggle theme">
      <motion.span key={theme} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.25 }}>
        {theme === 'dark' ? <Moon /> : <Sun />}
      </motion.span>
    </Button>
  )
}

function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2.5 rounded-lg text-left transition-colors outline-none hover:bg-surface-2',
            compact ? 'p-1' : 'w-full p-1.5',
          )}
        >
          <Avatar name={user.full_name} size={compact ? 28 : 30} />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{user.full_name}</span>
              <span className="block truncate text-xs text-subtle">@{user.username}</span>
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={compact ? 'bottom' : 'top'}
          align={compact ? 'end' : 'start'}
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-lg"
        >
          <div className="px-2 py-1.5 text-xs text-subtle">{user.email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {[
            { label: 'Public profile', icon: User, to: `/u/${user.username}` },
            { label: 'My uploads', icon: FolderUp, to: '/my-uploads' },
            ...(user.is_admin ? [{ label: 'Admin', icon: Shield, to: '/admin' }] : []),
          ].map((i) => (
            <DropdownMenu.Item
              key={i.to}
              onSelect={() => navigate(i.to)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
            >
              <i.icon className="size-4 text-muted" /> {i.label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              logout()
              navigate('/')
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
          >
            <LogOut className="size-4 text-muted" /> Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Sidebar() {
  const { user } = useAuth()
  const { open } = useCommandPalette()
  const { data: subjects } = useSubjects()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg lg:flex">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={() => open()}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-subtle shadow-xs transition-colors hover:border-border-strong hover:text-muted"
        >
          <Search className="size-3.5" />
          Search…
          <span className="ml-auto flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((n) => (
          <NavItem key={n.to} {...n} />
        ))}
        {user?.is_admin && <NavItem to="/admin" label="Admin" icon={Shield} />}

        <div className="px-2.5 pt-6 pb-2 text-2xs font-medium tracking-wider text-subtle uppercase">Subjects</div>
        {subjects?.map((s) => (
          <NavLink
            key={s.id}
            to={`/subjects/${s.slug}`}
            className={({ isActive }) =>
              cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
                isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg',
              )
            }
          >
            <span className="w-9 shrink-0 font-mono text-[10px] font-semibold text-subtle">{s.code}</span>
            <span className="truncate">{s.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t border-border p-3">
        <Link to="/upload" className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'w-full')}>
          <Upload /> Upload
        </Link>
        {user ? (
          <UserMenu />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Log in
            </Link>
            <Link to="/signup" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Sign up
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}

function MobileTopBar() {
  const { user } = useAuth()
  const { open } = useCommandPalette()
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border px-4 lg:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => open()} aria-label="Search">
          <Search />
        </Button>
        <ThemeToggle />
        {user ? (
          <UserMenu compact />
        ) : (
          <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label="Log in">
            <LogIn />
          </Link>
        )}
      </div>
    </header>
  )
}

function MobileBottomNav() {
  const { open } = useCommandPalette()
  const { user } = useAuth()
  const items = [
    { to: user ? '/dashboard' : '/', label: 'Home', icon: Home },
    { to: '/subjects', label: 'Subjects', icon: BookOpen },
    { to: '/upload', label: 'Upload', icon: Upload, primary: true },
    { to: '/bookmarks', label: 'Saved', icon: Bookmark },
  ]
  return (
    <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden">
      <div className="grid h-16 grid-cols-5">
        {items.slice(0, 2).map((i) => (
          <BottomItem key={i.to} {...i} />
        ))}
        <NavLink to="/upload" className="grid place-items-center" aria-label="Upload">
          <motion.span whileTap={{ scale: 0.92 }} className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-[0_6px_20px_-6px_var(--accent-ring)]">
            <Upload className="size-5" />
          </motion.span>
        </NavLink>
        <BottomItem {...items[3]} />
        <button onClick={() => open()} className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted">
          <Search className="size-5" />
          Search
        </button>
      </div>
    </nav>
  )
}

function BottomItem({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn('flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors', isActive ? 'text-fg' : 'text-muted')
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5', isActive && 'text-accent')} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-60">
        <MobileTopBar />
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pb-24 lg:pb-0"
        >
          {children}
        </motion.main>
      </div>
      <MobileBottomNav />
    </div>
  )
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10', className)}>{children}</div>
}
