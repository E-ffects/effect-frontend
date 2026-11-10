import { aiState, auth, clearSession } from './state'

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

export async function api(path, { method = 'GET', body, query, raw = false } = {}) {
  let url = '/api' + path
  if (query) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    }
    const qs = params.toString()
    if (qs) url += '?' + qs
  }
  const headers = { 'Content-Type': 'application/json' }
  if (auth.token) headers.Authorization = 'Bearer ' + auth.token
  let res
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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
      if (typeof data.detail === 'string') detail = data.detail
      // FastAPI 기본 입력 오류 형식 ([{loc, msg}, ...]) 대비
      else if (Array.isArray(data.detail)) detail = '입력값을 확인하세요 (' + data.detail.map((d) => d.loc?.at(-1)).join(', ') + ')'
    } catch {
      /* JSON이 아닌 응답 (프록시 오류 페이지 등) → 상태 코드별 기본 문구 */
    }
    throw new ApiError(res.status, detail)
  }
  if (raw) return res
  return res.status === 204 ? null : res.json()
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

export function isoDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}

export function daysAgo(n, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

export function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return Math.floor(diff / 60) + '분 전'
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전'
  return Math.floor(diff / 86400) + '일 전'
}
