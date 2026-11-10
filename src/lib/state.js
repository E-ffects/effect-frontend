import { reactive } from 'vue'

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function save(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — session continues in memory */
  }
}

export const auth = reactive({
  token: load('rma.token'),
  user: load('rma.user'),
})

export function setSession(token, user) {
  auth.token = token
  auth.user = user
  save('rma.token', token)
  save('rma.user', user)
}

export function clearSession() {
  setSession(null, null)
}

export function homePath(user = auth.user) {
  return user?.role === 'CS' ? '/cs/dashboard' : '/quality/dashboard'
}

// AI 서비스 상태 (NFR-02-3) — 503 응답이나 health 체크로 갱신
export const aiState = reactive({ available: true, provider: null })

// 챗봇 질의 맥락: RMA 목록에서 펼친 행 (FR-05-4)
export const chatContext = reactive({ rmaId: null })

// 토스트
export const toasts = reactive({ items: [] })
let toastSeq = 0

export function toast({ title, description = '', tone = 'default', action = null, duration = 4000 }) {
  const id = ++toastSeq
  const item = { id, title, description, tone, action, duration, timer: null }
  toasts.items.push(item)
  scheduleDismiss(item)
  return id
}

export function scheduleDismiss(item) {
  clearTimeout(item.timer)
  if (item.duration > 0) item.timer = setTimeout(() => dismissToast(item.id), item.duration)
}

export function dismissToast(id) {
  const i = toasts.items.findIndex((t) => t.id === id)
  if (i >= 0) toasts.items.splice(i, 1)
}

// AI 보고서 탭으로 이동 (보고서가 없으면 그 화면에서 바로 생성)
export function reportRoute(rmaId, generate = true) {
  return { path: '/quality/reports', query: generate ? { rmaId, generate: 1 } : { rmaId } }
}

// 알림 즐겨찾기·삭제 (벨 드롭다운 · 알림 센터 공용). 끝나면 onDone으로 목록을 다시 불러온다.
export async function starAlert(api, a, onDone) {
  try {
    await api(`/alerts/${a.id}/star`, { method: 'POST', body: { starred: !a.starred } })
    toast({ title: a.starred ? '즐겨찾기를 해제했습니다' : '즐겨찾기에 추가했습니다' })
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  }
  onDone?.()
}

export async function removeAlert(api, a, onDone) {
  try {
    await api(`/alerts/${a.id}`, { method: 'DELETE' })
    toast({ title: '알림을 삭제했습니다', description: a.target_label })
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  }
  onDone?.()
}

// 화면 전체를 불러오다 서버 오류가 나면 페이지 자리에 오류 패널을 띄운다 (AppShell 이 표시)
// 재시도는 페이지를 다시 그려 처음부터 불러온다 (pageError.retryKey 증가)
export const pageError = reactive({ status: null, message: '', retryKey: 0 })

export function clearPageError(retry = false) {
  pageError.status = null
  pageError.message = ''
  if (retry) pageError.retryKey++
}

// 페이지 첫 로딩 실패: 서버 쪽 오류면 오류 패널, 그 밖(400·404 등)은 토스트
export function reportLoadError(e) {
  if (e?.status === 401) return // api() 가 이미 로그인 화면으로 보냈다
  if (e?.serverFault) {
    pageError.status = e.status
    pageError.message = e.message
    return
  }
  toast({ title: e?.message || '요청을 처리하지 못했습니다', tone: 'red' })
}

// 어디서도 잡지 않은 오류 (버튼 동작 실패, 화면 코드 오류 등): 페이지는 그대로 두고 알림만
export function reportUnhandledError(e) {
  if (e?.status === 401) return
  if (e?.name === 'ApiError' || typeof e?.status === 'number') {
    toast({ title: e.message, tone: 'red' })
    return
  }
  console.error(e)
  toast({ title: '화면을 처리하는 중 오류가 발생했습니다', description: '새로고침 후 다시 시도하세요', tone: 'red' })
}
