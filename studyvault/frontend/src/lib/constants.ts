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
import type { FileKind, ResourceType } from './types'

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

/** Mirrors backend app/services/documents.py FORMATS. */
export const FILE_FORMATS: Record<string, { kind: FileKind; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  docx: { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  doc: { kind: 'document', mime: 'application/msword' },
  odt: { kind: 'document', mime: 'application/vnd.oasis.opendocument.text' },
  rtf: { kind: 'document', mime: 'application/rtf' },
  pptx: { kind: 'presentation', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  ppt: { kind: 'presentation', mime: 'application/vnd.ms-powerpoint' },
  odp: { kind: 'presentation', mime: 'application/vnd.oasis.opendocument.presentation' },
  xlsx: { kind: 'spreadsheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls: { kind: 'spreadsheet', mime: 'application/vnd.ms-excel' },
  ods: { kind: 'spreadsheet', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  csv: { kind: 'spreadsheet', mime: 'text/csv' },
  txt: { kind: 'text', mime: 'text/plain' },
  md: { kind: 'text', mime: 'text/markdown' },
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  webp: { kind: 'image', mime: 'image/webp' },
  gif: { kind: 'image', mime: 'image/gif' },
}

export const fileExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** react-dropzone accept map; extensions matter because OSes report odd MIME types for .md/.csv. */
export const UPLOAD_ACCEPT: Record<string, string[]> = Object.entries(FILE_FORMATS).reduce<Record<string, string[]>>(
  (acc, [ext, f]) => ({ ...acc, [f.mime]: [...(acc[f.mime] ?? []), `.${ext}`] }),
  {},
)

export const FILE_KIND_META: Record<FileKind, { label: string; unit: string }> = {
  pdf: { label: 'PDF', unit: 'pages' },
  document: { label: 'Document', unit: 'pages' },
  presentation: { label: 'Slides', unit: 'slides' },
  spreadsheet: { label: 'Spreadsheet', unit: 'sheets' },
  text: { label: 'Text', unit: 'pages' },
  image: { label: 'Image', unit: '' },
}

export const SUPPORTED_FORMATS_LABEL = 'PDF, Word, PowerPoint, Excel, OpenDocument, text, Markdown, CSV, images'
