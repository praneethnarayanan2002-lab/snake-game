export type ResourceType = 'notes' | 'pyq' | 'mid' | 'semester' | 'question_bank' | 'assignment' | 'reference'

export interface UserPublic {
  id: number
  username: string
  full_name: string
  college: string | null
  created_at: string
}

export interface UserMe extends UserPublic {
  email: string
  is_admin: boolean
}

export interface Unit {
  id: number
  number: number
  title: string
  topics: string
  resource_count: number
}

export interface SubjectBrief {
  id: number
  slug: string
  code: string
  name: string
}

export interface Subject extends SubjectBrief {
  description: string
  aliases: string
  resource_count: number
  star_count: number
  units: Unit[]
}

export interface ViewerState {
  starred: boolean
  bookmarked: boolean
  my_rating: number | null
  reported: boolean
}

export interface ScoreBreakdown {
  relevance: number
  subject_unit: number
  resource_type: number
  popularity: number
  rating: number
  total: number
}

export interface Resource {
  id: number
  title: string
  description: string
  file_url: string
  file_name: string
  file_size: number
  page_count: number
  subject: SubjectBrief
  unit: { id: number; number: number; title: string }
  resource_type: ResourceType
  resource_type_label: string
  year: number
  exam_type: string | null
  exam_type_label: string | null
  uploader: { id: number; username: string; full_name: string }
  view_count: number
  star_count: number
  rating_count: number
  average_rating: number
  bookmark_count: number
  tags: string[]
  created_at: string
  viewer: ViewerState | null
  score: ScoreBreakdown | null
  recommended: boolean
}

export interface ParsedQuery {
  raw: string
  keywords: string[]
  subject: SubjectBrief | null
  unit_number: number | null
  resource_type: ResourceType | null
  year: number | null
  exam_type: string | null
}

export interface SearchResponse {
  items: Resource[]
  total: number
  limit: number
  offset: number
  parsed: ParsedQuery
  sort: string
}

export interface Stats {
  star_count: number
  rating_count: number
  average_rating: number
  bookmark_count: number
  view_count: number
  viewer: ViewerState
}

export interface RecentItem {
  resource: Resource
  viewed_at: string
  last_page: number
}

export interface Dashboard {
  user: UserPublic
  stats: { uploads: number; stars_received: number; views_received: number; bookmarks: number }
  recent: RecentItem[]
  recommended: Resource[]
  subjects: SubjectBrief[]
  bookmarks: Resource[]
  uploads: Resource[]
  popular: Resource[]
}

export interface Meta {
  resource_types: Record<ResourceType, string>
  exam_types: Record<string, string>
  report_reasons: Record<string, string>
}

export interface ExamPlan {
  subject: SubjectBrief
  exam: string
  exam_label: string
  scope_units: number[]
  focus_unit: number
  steps: { key: string; title: string; subtitle: string; items: Resource[] }[]
}

export interface AdminReport {
  id: number
  reason: string
  details: string
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  reporter: { id: number; username: string; full_name: string }
  resource: Resource | null
  open_reports_for_resource: number
}
