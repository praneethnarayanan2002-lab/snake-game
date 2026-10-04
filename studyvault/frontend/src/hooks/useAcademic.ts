import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api, type SubjectQuery } from '@/services/api'

export interface Academic {
  branch: string
  year: number
  semester: number
}

/** The syllabus each year of study follows in 2026–27 (mirrors the API's CURRENT_REGULATION_BY_YEAR). */
export const CURRENT_REGULATION: Record<number, string> = { 1: 'GR25', 2: 'GR25', 3: 'GR24', 4: 'GR22' }
export const regulationFor = (year?: number | null) => (year ? CURRENT_REGULATION[year] : undefined)

const KEY = 'sv-academic'
// Visitors start on GRIET's largest programme, mid-way through.
const DEFAULT: Academic = { branch: 'CSE', year: 3, semester: 1 }

function readLocal(): Academic {
  try {
    const { branch, year, semester } = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return { branch, year, semester }
  } catch {
    return DEFAULT
  }
}

/**
 * The student's branch / year / semester (the regulation follows from the year).
 * Signed-in users keep it on their profile; visitors keep it in localStorage.
 * Everything "for you" is scoped by this.
 */
export function useAcademic() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [local, setLocal] = useState<Academic>(readLocal)
  useEffect(() => {
    const onStorage = () => setLocal(readLocal())
    window.addEventListener('sv-academic', onStorage)
    return () => window.removeEventListener('sv-academic', onStorage)
  }, [])

  const fromProfile = !!(user?.branch_code && user.current_year)
  const academic: Academic = fromProfile
    ? { branch: user!.branch_code!, year: user!.current_year!, semester: user!.current_semester ?? 1 }
    : local

  const setAcademic = useCallback(
    async (next: Academic) => {
      localStorage.setItem(KEY, JSON.stringify(next))
      setLocal(next)
      window.dispatchEvent(new Event('sv-academic'))
      if (user) {
        const updated = await api.updateMe({ branch: next.branch, current_year: next.year, current_semester: next.semester })
        qc.setQueryData(['me'], updated)
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }
    },
    [user, qc],
  )

  return { academic, regulation: regulationFor(academic.year)!, setAcademic, isProfileSet: fromProfile }
}

export function useSubjectList(params: SubjectQuery, enabled = true) {
  return useQuery({ queryKey: ['subjects', params], queryFn: () => api.subjects(params), staleTime: 5 * 60_000, enabled })
}

/** The courses of the student's current semester — their "main subjects". */
export function useSemesterSubjects(kind?: 'theory' | 'lab' | 'project') {
  const { academic } = useAcademic()
  const q = useSubjectList({ branch: academic.branch, year: academic.year, semester: academic.semester, kind })
  return { ...q, data: q.data?.filter((s) => !s.elective) }
}

export function useSubject(slug?: string | null) {
  return useQuery({ queryKey: ['subject', slug], queryFn: () => api.subject(slug!), enabled: !!slug, staleTime: 60_000 })
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV']
export const semLabel = (year?: number | null, semester?: number | null) =>
  year ? `${ROMAN[year]}${semester ? `-${ROMAN[semester]}` : ''}` : ''
export const semLong = (year?: number | null, semester?: number | null) =>
  year ? `${ROMAN[year]} Year${semester ? ` · ${ROMAN[semester]} Sem` : ''}` : ''
