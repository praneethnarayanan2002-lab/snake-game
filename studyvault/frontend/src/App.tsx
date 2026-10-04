import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { CommandPaletteProvider } from '@/components/layout/CommandPalette'
import { Spinner } from '@/components/ui/feedback'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import AuthPage from '@/pages/AuthPage'
import HomePage from '@/pages/HomePage'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const SubjectsPage = lazy(() => import('@/pages/SubjectsPage'))
const SubjectPage = lazy(() => import('@/pages/SubjectPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const ResourcePage = lazy(() => import('@/pages/ResourcePage'))
const UploadPage = lazy(() => import('@/pages/UploadPage'))
const LibraryPage = lazy(() => import('@/pages/LibraryPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const ExamModePage = lazy(() => import('@/pages/ExamModePage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !user.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-subtle">
      <Spinner />
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const { theme } = useTheme()
  return (
    <TooltipPrimitive.Provider>
      <CommandPaletteProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route
            path="*"
            element={
              <AppShell>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/subjects" element={<SubjectsPage />} />
                    <Route path="/subjects/:slug" element={<SubjectPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/resources/:id" element={<ResourcePage />} />
                    <Route path="/u/:username" element={<ProfilePage />} />
                    <Route path="/exam" element={<ExamModePage />} />
                    <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
                    <Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
                    <Route path="/bookmarks" element={<RequireAuth><LibraryPage kind="bookmarks" /></RequireAuth>} />
                    <Route path="/my-uploads" element={<RequireAuth><LibraryPage kind="uploads" /></RequireAuth>} />
                    <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </AppShell>
            }
          />
        </Routes>
        <Toaster
          theme={theme}
          position="bottom-right"
          offset={{ bottom: 20 }}
          mobileOffset={{ bottom: 84 }}
          toastOptions={{
            classNames: {
              toast: '!bg-bg-elevated !border-border-strong !text-fg !shadow-lg !rounded-lg',
              description: '!text-muted',
              actionButton: '!bg-accent !text-accent-fg',
            },
          }}
        />
      </CommandPaletteProvider>
    </TooltipPrimitive.Provider>
  )
}
