import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, daysAgo } from './api'

const meta = ref(null)
let pending = null

// 제품·불량 유형 등 코드 목록 (한 번만 불러와 공유)
export function useMeta() {
  if (!meta.value && !pending) {
    pending = api('/meta')
      .then((m) => (meta.value = m))
      .finally(() => (pending = null))
  }
  return meta
}

// 대시보드 기간: URL from/to 유지, 기본 최근 N일
export function usePeriod(defaultDays = 30) {
  const route = useRoute()
  const router = useRouter()
  const from = computed(() => route.query.from || daysAgo(defaultDays - 1))
  const to = computed(() => route.query.to || daysAgo(0))
  function apply(p) {
    router.replace({ query: { ...route.query, from: p.from, to: p.to } })
  }
  return { from, to, apply }
}
