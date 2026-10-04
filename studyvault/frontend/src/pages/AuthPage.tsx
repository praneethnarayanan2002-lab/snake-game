import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Logo, ThemeToggle } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { GridBackdrop } from '@/components/ui/effects'
import { Input, Label } from '@/components/ui/primitives'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const isLogin = mode === 'login'
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const [form, setForm] = useState({ identifier: '', full_name: '', username: '', email: '', password: '', college: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pwStrength = strength(form.password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = isLogin
        ? await login(form.identifier, form.password)
        : await signup({ full_name: form.full_name, username: form.username, email: form.email, password: form.password, college: form.college || undefined })
      toast.success(isLogin ? `Welcome back, ${user.full_name.split(' ')[0]}` : 'Account created — welcome to StudyVault')
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="w-full max-w-sm">
            <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
              <ArrowLeft className="size-3.5" /> Back to library
            </Link>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
            <p className="mt-1.5 text-sm text-muted">
              {isLogin ? 'Log in to star, rate, bookmark and upload.' : 'Free forever. Share notes, save the good ones.'}
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              {isLogin ? (
                <div>
                  <Label htmlFor="identifier">Username or email</Label>
                  <Input id="identifier" autoComplete="username" autoFocus required value={form.identifier} onChange={set('identifier')} placeholder="sanjith" />
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="full_name">Full name</Label>
                    <Input id="full_name" autoComplete="name" autoFocus required value={form.full_name} onChange={set('full_name')} placeholder="Sanjith Kumar" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        autoComplete="username"
                        required
                        minLength={3}
                        pattern="[a-zA-Z0-9_.]+"
                        title="Letters, numbers, dots and underscores"
                        value={form.username}
                        onChange={set('username')}
                        placeholder="sanjith"
                      />
                    </div>
                    <div>
                      <Label htmlFor="college">
                        College <span className="font-normal text-subtle">(optional)</span>
                      </Label>
                      <Input id="college" value={form.college} onChange={set('college')} placeholder="JNTU" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@college.edu" />
                  </div>
                </>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    minLength={isLogin ? undefined : 8}
                    value={form.password}
                    onChange={set('password')}
                    placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle hover:text-fg" aria-label="Toggle password visibility">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {!isLogin && form.password && (
                  <div className="mt-2 flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className={cn('h-1 flex-1 rounded-full', i < pwStrength ? (pwStrength >= 3 ? 'bg-success' : 'bg-star') : 'bg-surface-3')}
                        initial={false}
                        animate={{ opacity: 1 }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">
                  {error}
                </motion.p>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                {isLogin ? 'Log in' : 'Create account'}
              </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-muted">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Link to={`${isLogin ? '/signup' : '/login'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-fg underline-offset-4 hover:underline">
                {isLogin ? 'Sign up' : 'Log in'}
              </Link>
            </p>
            {isLogin && (
              <div className="mt-8 rounded-lg border border-dashed border-border-strong p-3 text-xs text-muted">
                <span className="font-medium text-fg">Demo accounts</span> · <code className="font-mono">sanjith / sanjith12345</code> · admin: <code className="font-mono">admin / admin12345</code>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-surface lg:block">
        <GridBackdrop />
        <div className="relative flex h-full flex-col justify-center px-14">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }} className="max-w-md">
            <div className="space-y-3">
              {[
                { t: 'DBMS Unit 3 — Normalization Complete Notes', m: 'DBMS · Unit 3 · Notes · 2025', s: 128, rec: true },
                { t: 'OS Unit 3 Previous Year Questions', m: 'OS · Unit 3 · PYQ · 2024', s: 94 },
                { t: 'CN Semester Examination 2025', m: 'CN · Unit 5 · Semester · 2025', s: 61 },
              ].map((c, i) => (
                <motion.div
                  key={c.t}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.1, duration: 0.4 }}
                  className={cn('rounded-xl border bg-bg-elevated p-4 shadow-md', c.rec ? 'border-accent/40' : 'border-border', i === 1 && 'ml-8', i === 2 && 'ml-4')}
                >
                  {c.rec && <div className="mb-2 text-2xs font-semibold tracking-wide text-accent uppercase">✦ Recommended</div>}
                  <div className="text-sm font-semibold">{c.t}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    {c.m}
                    <span className="inline-flex items-center gap-1 text-star">
                      <Star className="size-3 fill-current" /> {c.s}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
            <blockquote className="mt-10 text-lg leading-snug font-medium tracking-tight text-fg">
              “I stopped digging through 14 WhatsApp groups the night before my DBMS mid. Everything I needed was ranked and in one place.”
            </blockquote>
            <p className="mt-3 text-sm text-muted">— 3rd year CSE student</p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
