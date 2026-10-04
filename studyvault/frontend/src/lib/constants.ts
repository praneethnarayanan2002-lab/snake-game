import {
  BookMarked,
  ClipboardList,
  FileClock,
  FileQuestion,
  GraduationCap,
  NotebookPen,
  NotebookText,
  type LucideIcon,
} from 'lucide-react'
import type { ResourceType } from './types'

export const RESOURCE_TYPES: { value: ResourceType; label: string; short: string; icon: LucideIcon; hint: string }[] = [
  { value: 'notes', label: 'Notes', short: 'Notes', icon: NotebookText, hint: 'Lecture or handwritten notes' },
  { value: 'pyq', label: 'Previous Year Papers', short: 'PYQ', icon: FileClock, hint: 'Past questions, often unit-wise' },
  { value: 'mid', label: 'Mid Exam Papers', short: 'Mid', icon: FileQuestion, hint: 'Mid 1 / Mid 2 papers' },
  { value: 'semester', label: 'Semester Papers', short: 'Semester', icon: GraduationCap, hint: 'End-semester question papers' },
  { value: 'question_bank', label: 'Question Banks', short: 'Q-Bank', icon: ClipboardList, hint: 'Important question sets' },
  { value: 'assignment', label: 'Assignments', short: 'Assignment', icon: NotebookPen, hint: 'Assignment sheets & solutions' },
  { value: 'reference', label: 'Reference Material', short: 'Reference', icon: BookMarked, hint: 'Books, handbooks, cheat sheets' },
]

export const TYPE_BY_VALUE = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.value, t])) as Record<
  ResourceType,
  (typeof RESOURCE_TYPES)[number]
>

export const EXAM_TYPES = [
  { value: 'mid1', label: 'Mid 1' },
  { value: 'mid2', label: 'Mid 2' },
  { value: 'semester', label: 'Semester' },
  { value: 'supplementary', label: 'Supplementary' },
  { value: 'internal', label: 'Internal' },
]

export const EXAM_RESOURCE_TYPES: ResourceType[] = ['pyq', 'mid', 'semester']

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'wrong_subject', label: 'Wrong subject / unit' },
  { value: 'low_quality', label: 'Unreadable or low quality' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
]

const thisYear = new Date().getFullYear()
export const YEARS = Array.from({ length: 10 }, (_, i) => thisYear - i)

export const SORTS = [
  { value: 'best', label: 'Best match' },
  { value: 'stars', label: 'Most starred' },
  { value: 'rating', label: 'Top rated' },
  { value: 'views', label: 'Most viewed' },
  { value: 'newest', label: 'Newest' },
]

export const MAX_UPLOAD_MB = 20
