import type {
  AdminReport,
  Dashboard,
  ExamPlan,
  Meta,
  RecentItem,
  Resource,
  SearchResponse,
  Stats,
  Subject,
  UserMe,
  UserPublic,
} from '@/lib/types'

const TOKEN_KEY = 'sv-token'
export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) {
      const d = detail[0]
      const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : ''
      return field ? `${String(field).replace(/_/g, ' ')}: ${d.msg}` : d.msg
    }
  }
  return fallback
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) tokenStore.clear()
    throw new ApiError(res.status, errorMessage(body, res.statusText || 'Request failed'))
  }
  return body as T
}

const json = (data: unknown) => JSON.stringify(data)

export interface SearchParams {
  q?: string
  subject?: string
  unit?: number
  type?: string
  year?: number
  exam_type?: string
  sort?: string
  limit?: number
  offset?: number
  uploader?: number
}

function qs(params: object): string {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  })
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export interface UploadInput {
  file: File
  title: string
  subject_id: number
  unit_id: number
  resource_type: string
  year: number
  exam_type?: string
  description: string
  tags: string
}

export const api = {
  signup: (data: { username: string; email: string; full_name: string; password: string; college?: string }) =>
    request<{ access_token: string; user: UserMe }>('/api/auth/signup', { method: 'POST', body: json(data) }),
  login: (identifier: string, password: string) =>
    request<{ access_token: string; user: UserMe }>('/api/auth/login', { method: 'POST', body: json({ identifier, password }) }),
  me: () => request<UserMe>('/api/auth/me'),

  meta: () => request<Meta>('/api/meta'),
  subjects: () => request<Subject[]>('/api/subjects'),
  subject: (slug: string) => request<Subject>(`/api/subjects/${slug}`),

  search: (p: SearchParams) => request<SearchResponse>(`/api/search${qs(p)}`),
  trending: (limit = 8) => request<Resource[]>(`/api/trending?limit=${limit}`),
  examPlan: (subject: string, exam: string, focus_unit?: number) =>
    request<ExamPlan>(`/api/exam-plan${qs({ subject, exam, focus_unit })}`),

  resource: (id: number) => request<Resource>(`/api/resources/${id}`),
  recordView: (id: number) => request<Stats>(`/api/resources/${id}/view`, { method: 'POST' }),
  saveProgress: (id: number, page: number) =>
    request<void>(`/api/resources/${id}/progress`, { method: 'PUT', body: json({ page }) }),
  star: (id: number, on: boolean) => request<Stats>(`/api/resources/${id}/star`, { method: on ? 'POST' : 'DELETE' }),
  bookmark: (id: number, on: boolean) =>
    request<Stats>(`/api/resources/${id}/bookmark`, { method: on ? 'POST' : 'DELETE' }),
  rate: (id: number, rating: number) =>
    request<Stats>(`/api/resources/${id}/rating`, { method: 'PUT', body: json({ rating }) }),
  report: (id: number, reason: string, details: string) =>
    request<{ ok: true }>(`/api/resources/${id}/report`, { method: 'POST', body: json({ reason, details }) }),
  updateResource: (id: number, data: Partial<Record<string, unknown>>) =>
    request<Resource>(`/api/resources/${id}`, { method: 'PATCH', body: json(data) }),
  deleteResource: (id: number) => request<void>(`/api/resources/${id}`, { method: 'DELETE' }),

  /** Multipart upload with progress via XHR (fetch has no upload progress events). */
  upload: (input: UploadInput, onProgress: (pct: number) => void) =>
    new Promise<Resource>((resolve, reject) => {
      const form = new FormData()
      Object.entries(input).forEach(([k, v]) => {
        if (v !== undefined && v !== '') form.append(k, v instanceof File ? v : String(v))
      })
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/api/resources`)
      const token = tokenStore.get()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
      xhr.onload = () => {
        const body = (() => {
          try {
            return JSON.parse(xhr.responseText)
          } catch {
            return null
          }
        })()
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as Resource)
        else reject(new ApiError(xhr.status, errorMessage(body, 'Upload failed')))
      }
      xhr.onerror = () => reject(new ApiError(0, 'Network error — check your connection'))
      xhr.send(form)
    }),

  dashboard: () => request<Dashboard>('/api/me/dashboard'),
  myUploads: () => request<Resource[]>('/api/me/uploads'),
  myBookmarks: () => request<Resource[]>('/api/me/bookmarks'),
  recent: (limit = 10) => request<RecentItem[]>(`/api/me/recent?limit=${limit}`),
  profile: (username: string) =>
    request<{ user: UserPublic; stats: { uploads: number; stars_received: number; views_received: number }; uploads: Resource[] }>(
      `/api/users/${username}`,
    ),

  admin: {
    overview: () => request<{ resources: number; users: number; open_reports: number; views: number }>('/api/admin/overview'),
    resources: (q = '') => request<{ items: Resource[]; total: number }>(`/api/admin/resources${qs({ q, limit: 100 })}`),
    reports: (status = 'open') => request<AdminReport[]>(`/api/admin/reports?status=${status}`),
    setReport: (id: number, status: string) =>
      request<{ ok: true }>(`/api/admin/reports/${id}`, { method: 'PATCH', body: json({ status }) }),
    deleteResource: (id: number) => request<void>(`/api/admin/resources/${id}`, { method: 'DELETE' }),
    purgeUser: (id: number) => request<{ deleted: number }>(`/api/admin/users/${id}/purge`, { method: 'POST' }),
    createSubject: (data: object) => request<Subject>('/api/admin/subjects', { method: 'POST', body: json(data) }),
    updateSubject: (id: number, data: object) =>
      request<Subject>(`/api/admin/subjects/${id}`, { method: 'PATCH', body: json(data) }),
    addUnit: (subjectId: number, data: object) =>
      request<Subject>(`/api/admin/subjects/${subjectId}/units`, { method: 'POST', body: json(data) }),
    updateUnit: (id: number, data: object) => request<Subject>(`/api/admin/units/${id}`, { method: 'PATCH', body: json(data) }),
    deleteUnit: (id: number) => request<void>(`/api/admin/units/${id}`, { method: 'DELETE' }),
  },
}

export const fileUrl = (r: Pick<Resource, 'file_url'>, download = false) =>
  `${API_BASE}${r.file_url}${download ? '?download=1' : ''}`
