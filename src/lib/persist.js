import { ref, watch } from 'vue'

// 필터를 브라우저에 기억해 새로고침·다른 화면 이동 후에도 유지한다.
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 조용히 기본값으로 동작한다.
const PREFIX = 'rma.filters.'

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 화면 안 상태로 들고 있는 필터 (보고서 이력, 대책 이력 등)
export function persistedRef(key, initial) {
  const saved = read(key)
  const r = ref(saved && typeof saved === 'object' ? { ...initial, ...saved } : { ...initial })
  watch(r, (v) => write(key, Object.values(v).some(Boolean) ? v : null), { deep: true })
  return r
}

// URL 쿼리로 들고 있는 필터: 경로별로 기억할 쿼리 (제외 키는 저장하지 않는다)
const STICKY = {
  '/quality/dashboard': { exclude: [] }, // 기간(from·to)
  '/cs/dashboard': { exclude: [] },
  '/rmas': { exclude: ['open', 'page'] },
  '/quality/patterns': { exclude: ['patternId'] },
  '/quality/recurrence': { exclude: ['recurId'] },
}

function pick(path, query) {
  const ex = STICKY[path].exclude
  const out = {}
  for (const [k, v] of Object.entries(query)) if (!ex.includes(k) && v !== '' && v != null) out[k] = v
  return out
}

// 주소에 쿼리 없이 들어오면(메뉴 이동·새로고침 후 첫 진입) 마지막 필터를 되살린다.
// 다른 화면에서 조건을 붙여 들어오는 경우(대시보드 → RMA 조회 등)는 그 조건을 그대로 쓴다.
// 같은 화면 안에서 조건을 비운 경우(초기화·칩 삭제)는 되살리지 않는다.
export function restoreQuery(to, from) {
  if (!STICKY[to.path] || Object.keys(to.query).length || from?.path === to.path) return null
  const saved = read('route:' + to.path)
  return saved && Object.keys(saved).length ? { path: to.path, query: saved, hash: to.hash, replace: true } : null
}

export function saveQuery(to) {
  if (!STICKY[to.path]) return
  const q = pick(to.path, to.query)
  write('route:' + to.path, Object.keys(q).length ? q : null)
}
