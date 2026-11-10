import { ref } from 'vue'
import { api } from '@/lib/api'

// 펼침 영역 공통 로딩: ①② 먼저, ③ 유사 사례는 진행 중이면 자동·처리완료면 요청 시, AI 제안은 별도(장애 격리)
export function useRmaDetail(rmaId) {
  const rma = ref(null)
  const error = ref('')
  const similar = ref(null) // { items, summary } | null
  const similarState = ref('idle') // idle | loading | done | error
  const assist = ref(null)
  const assistError = ref('')

  async function loadDetail() {
    try {
      rma.value = await api(`/rmas/${rmaId}`)
    } catch (e) {
      error.value = e.message
    }
  }

  async function loadSimilar() {
    similarState.value = 'loading'
    try {
      similar.value = await api(`/rmas/${rmaId}/similar`)
      similarState.value = 'done'
    } catch {
      similarState.value = 'error'
    }
  }

  async function loadAssist() {
    assistError.value = ''
    try {
      assist.value = await api(`/rmas/${rmaId}/ai`)
    } catch (e) {
      assistError.value = e.status === 503 ? 'AI 일시 불가' : e.message
    }
  }

  async function init() {
    await loadDetail()
    if (!rma.value) return
    if (!rma.value.completed) loadSimilar()
    loadAssist()
  }

  return { rma, error, similar, similarState, assist, assistError, init, loadDetail, loadSimilar, loadAssist }
}
