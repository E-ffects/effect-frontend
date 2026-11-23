import { ref } from 'vue'
import { aiState, auth, clearSession, setSession } from './state'

export class ApiError extends Error {
  name = 'ApiError'

  constructor(status, message) {
    super(message)
    this.status = status
  }

  // 서버에 닿지 못했거나 서버 쪽 오류 (503 = AI 일시 불가는 AI 배너로 따로 안내하므로 제외)
  get serverFault() {
    return this.status === 0 || (this.status >= 500 && this.status !== 503)
  }
}

const OFFLINE = '서버에 연결할 수 없습니다. 네트워크를 확인하고 잠시 후 다시 시도하세요'

function fallbackMessage(status) {
  if (status === 502 || status === 504) return '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요'
  if (status === 413) return '요청 크기가 너무 큽니다'
  if (status === 429) return '요청이 많습니다. 잠시 후 다시 시도하세요'
  if (status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요'
  return '요청을 처리하지 못했습니다'
}

// Spring 연결 전 화면 개발: VITE_API_MOCK=1 이면 Spring_API_v5 목업이 응답한다 (src/mock)
export const MOCK = import.meta.env.VITE_API_MOCK === '1'
let mockModule = null

async function viaMock(path, opts) {
  mockModule ??= await import('@/mock/mockApi.js')
  try {
    return await mockModule.mockApi(path, opts)
  } catch (e) {
    throw new ApiError(e.status ?? 500, e.message)
  }
}

export async function api(path, { method = 'GET', body, query, raw = false } = {}) {
  if (MOCK) return viaMock(path, { method, body, query })
  let url = '/api' + path
  if (query) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    }
    const qs = params.toString()
    if (qs) url += '?' + qs
  }
  const isForm = body instanceof FormData // 파일 첨부(multipart)는 브라우저가 경계값을 붙이도록 Content-Type을 비운다
  const send = () => {
    const headers = isForm ? {} : { 'Content-Type': 'application/json' }
    if (auth.token) headers.Authorization = 'Bearer ' + auth.token
    return fetch(url, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) })
  }
  let res
  try {
    res = await send()
    // Access Token 만료: refresh_token 쿠키로 한 번 재발급하고 같은 요청을 다시 보낸다
    if (res.status === 401 && auth.token && (await reissue())) res = await send()
  } catch {
    throw new ApiError(0, OFFLINE)
  }
  if (res.status === 401 && auth.token) {
    clearSession()
    const back = location.pathname + location.search
    location.href = '/login?redirect=' + encodeURIComponent(back)
    throw new ApiError(401, '로그인이 필요합니다')
  }
  if (res.status === 503) aiState.available = false
  if (!res.ok) {
    let detail = fallbackMessage(res.status)
    try {
      const data = await res.json()
      if (typeof data.message === 'string') detail = data.message // Spring: {code, message, content}
      else if (typeof data.detail === 'string') detail = data.detail // AI 서버: {detail, code}
      // FastAPI 기본 입력 오류 형식 ([{loc, msg}, ...]) 대비
      else if (Array.isArray(data.detail)) detail = '입력값을 확인하세요 (' + data.detail.map((d) => d.loc?.at(-1)).join(', ') + ')'
    } catch {
      /* JSON이 아닌 응답 (프록시 오류 페이지 등) → 상태 코드별 기본 문구 */
    }
    throw new ApiError(res.status, detail)
  }
  if (raw) return res
  if (res.status === 204) return null
  const data = await res.json()
  // Spring 공통 응답 {code, message, content}는 content만 꺼낸다. AI 서버 응답은 그대로
  return isWrapped(data) ? data.content : data
}

function isWrapped(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    && 'code' in data && 'message' in data && 'content' in data
}

// 동시에 여러 요청이 401을 받아도 재발급은 한 번만
let reissuing = null

async function reissue() {
  reissuing ??= (async () => {
    try {
      const res = await fetch('/api/auth/reissue', { method: 'POST' })
      if (!res.ok) return false
      const data = await res.json()
      const token = isWrapped(data) ? data.content?.token : data.token
      if (!token) return false
      setSession(token, auth.user)
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => (reissuing = null))
    }
  })()
  return reissuing
}

// 파일 저장 (CSV·보고서 다운로드)
export function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fmtDate(d) {
  if (!d) return '—'
  return String(d).slice(0, 10)
}

export function fmtDateTime(d) {
  if (!d) return '—'
  return String(d).slice(0, 16).replace('T', ' ')
}

export function fmtWon(n) {
  if (n == null) return '—'
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억원'
  if (n >= 10_000) return Math.round(n / 10_000).toLocaleString() + '만원'
  return n.toLocaleString() + '원'
}

export const referenceDate = ref('2025-12-31')

export function daysAgo(n, from = referenceDate.value) {
  const date = new Date(`${from}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - n)
  return date.toISOString().slice(0, 10)
}

export function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return Math.floor(diff / 60) + '분 전'
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전'
  return Math.floor(diff / 86400) + '일 전'
}
