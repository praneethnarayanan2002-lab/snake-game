import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      const root = document.documentElement
      // Suppress transitions during the swap so every surface flips at once.
      root.classList.add('no-transitions')
      root.classList.toggle('dark', next === 'dark')
      localStorage.setItem('sv-theme', next)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#09090b' : '#fafafa')
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transitions')))
      return next
    })
  }, [])
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
