<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUp,
  Bell,
  Bot,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Layers,
  PanelLeft,
  Search,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-vue-next'
import FluidBg from '@/components/FluidBg.vue'
import MobileSidebar from '@/components/MobileSidebar.vue'
import { api, fmtDate, timeAgo } from '@/lib/api'
import { auth, clearSession } from '@/lib/state'

// 모바일 전용 Flowstate 다크 + ChatGPT 스타일 통합 뷰 (/m)
const route = useRoute()
const router = useRouter()

const isCs = computed(() => auth.user?.role === 'CS')
const sidebarOpen = ref(false)
const activeTab = ref('chat') // 'chat' | 'rmas' | 'patterns' | 'approvals' | 'alerts'

const GENERAL_SCOPE = { key: 'GENERAL', type: 'GENERAL', id: null, label: '범용 AI', sub: '전체 지식·기준' }

// 스코프 목록 (상단 선택 칩) & 실제 채팅 이력이 있는 항목들 ("채팅 한 것만")
const scopes = ref([]) // [{ key, type: 'RMA'|'PATTERN', id, label, sub }]
const activeScope = ref(GENERAL_SCOPE)
const threadMap = ref({}) // { [key]: { key, type, id, label, preview, count } }

const rmaThreads = computed(() =>
  Object.values(threadMap.value).filter((t) => t.type === 'RMA' && t.count > 0),
)
const patternThreads = computed(() =>
  Object.values(threadMap.value).filter((t) => t.type === 'PATTERN' && t.count > 0),
)

// 채팅 상태
const messages = ref([])
const threadId = ref(null)
const input = ref('')
const busy = ref(false)
const revealed = ref(false)
const scroller = ref(null)
const inputEl = ref(null)

// 모바일 최적화 페이지 데이터
const rmaList = ref([])
const rmaQuery = ref('')
const rmaLoading = ref(false)

const patternList = ref([])
const patternQuery = ref('')
const patternLoading = ref(false)

const approvalList = ref([])
const approvalLoading = ref(false)

// 알림 및 재발 (알림 센터 + 재발·대책 서브탭)
const alertSubTab = ref('alerts') // 'alerts' | 'actions'
const alertList = ref([])
const alertLoading = ref(false)
const actionList = ref([])
const actionLoading = ref(false)
const expandedAlertId = ref(null)
const highlightedActionId = ref(null)

const ACTION_ROLE = { OCCURRENCE: '발생 대책', ESCAPE: '유출 대책', PREVENTION: '예방 대책', HORIZONTAL: '수평 전개' }
const ACTION_STATUS = { IMPLEMENTING: '시행 중', MONITORING: '효과 확인 중', EFFECTIVE: '효과있음', NOT_EFFECTIVE: '효과없음' }

const heroWords = ['무엇을', '분석해', '드릴까요?']
const subWords = ['PCB', '반품', '이력과', '사내', '품질', '기준을', '바탕으로', '즉시', '답변합니다.']

const tabTitle = computed(() => {
  if (activeTab.value === 'rmas') return 'RMA 조회'
  if (activeTab.value === 'patterns') return '불량 패턴 분석'
  if (activeTab.value === 'approvals') return '원인 판정'
  if (activeTab.value === 'alerts') return '알림 및 재발'
  return 'E!ffect AI'
})

const filteredPatterns = computed(() => {
  const q = patternQuery.value.trim().toLowerCase()
  if (!q) return patternList.value
  return patternList.value.filter((p) => {
    const hay = [p.pattern_id, p.product, p.part_no, p.defect_type, p.major_name, p.minor_name, p.summary]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
})

const quickPrompts = computed(() => {
  const sc = activeScope.value
  if (!sc || sc.type === 'GENERAL') {
    if (isCs.value) {
      return [
        { label: 'RMA 처리 절차 · 기준 안내', text: 'PCB 반품 접수 후 표준 처리 절차와 고객 안내 기준을 요약해 줘.' },
        { label: '주요 불량 유형별 대응 가이드', text: '자주 발생하는 PCB 불량 유형별 기본 고객 안내 포인트를 정리해 줘.' },
        { label: '보증 · 재발 판정 기준', text: '사내 품질 기준에서 재발 판정과 보상 처리 기준이 어떻게 되나요?' },
      ]
    }
    return [
      { label: 'PCB 주요 불량 원인 · 공정 기준', text: '주요 PCB 불량 유형별 핵심 발생 공정과 사내 품질 관리 기준을 요약해 줘.' },
      { label: '재발 판정 · 대책 검증 기준', text: '시정 대책 시행 후 재발 여부와 대책 효과를 판정하는 기준을 설명해 줘.' },
      { label: '검출 유출 방지 점검 포인트', text: 'AOI·X-Ray 등 공정 검사에서 불량 유출을 막기 위한 핵심 점검 항목을 알려줘.' },
    ]
  }
  if (sc.type === 'PATTERN') {
    return [
      { label: '핵심 원인·추이 분석', text: `불량 패턴 ${sc.id}의 핵심 발생 원인과 최근 발생 추이를 요약해 줘.` },
      { label: '영향 설비·Lot 정리', text: `이 패턴에 연결된 주요 설비와 영향 Lot, 시정 조치 현황을 알려줘.` },
      { label: '검출 유출 원인', text: `이 패턴에서 검출이 누락된 원인과 보완 포인트를 설명해 줘.` },
    ]
  }
  if (isCs.value) {
    return [
      { label: '진행 상태·고객 안내', text: `${sc.id}의 현재 진행 상태와 고객에게 보낼 안내 내용을 정리해 줘.` },
      { label: '유사 사례 처리 이력', text: `${sc.id}와 비슷한 과거 사례는 어떻게 처리했는지 알려줘.` },
      { label: '권장 처리방안', text: `이 건의 권장 처리방안과 예상 소요일을 알려줘.` },
    ]
  }
  return [
    { label: '1순위 원인·핵심 근거', text: `${sc.id}의 1순위 유력 원인과 공정·설비 핵심 근거를 설명해 줘.` },
    { label: '유사 사례 · 당시 대책', text: `비슷한 과거 사례와 당시 적용했던 개선 대책을 알려줘.` },
    { label: '영향 Lot · 재발 여부', text: `영향 받은 생산 Lot과 재발 판정 여부를 정리해 줘.` },
  ]
})

function scopeKey(type, id) {
  return type === 'GENERAL' ? 'GENERAL' : `${type}:${id}`
}

function storageKey() {
  return `rma.mobile.threads.${auth.user?.id || auth.user?.email || 'anon'}`
}

function loadSavedThreadKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function persistThreadKey(type, id, label) {
  if (type === 'GENERAL') return
  try {
    const list = loadSavedThreadKeys()
    const key = scopeKey(type, id)
    if (!list.some((x) => x.key === key)) {
      list.unshift({ key, type, id, label })
      localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, 30)))
    }
  } catch {
    /* ignore */
  }
}

function registerActiveThread(sc, msgs) {
  if (!sc || sc.type === 'GENERAL' || !msgs?.length) return
  const lastMsg = msgs[msgs.length - 1]
  const preview = (lastMsg?.text || '').replace(/\s+/g, ' ').slice(0, 42)
  const key = scopeKey(sc.type, sc.id)
  threadMap.value = {
    ...threadMap.value,
    [key]: {
      key,
      type: sc.type,
      id: sc.id,
      label: sc.label,
      preview,
      count: msgs.length,
    },
  }
  persistThreadKey(sc.type, sc.id, sc.label)
}

function scrollBottom() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

async function probeActiveThreads(candidates) {
  const map = new Map()
  for (const s of loadSavedThreadKeys()) map.set(s.key, s)
  for (const c of candidates) map.set(c.key, c)

  const targets = [...map.values()].filter((c) => !isCs.value || c.type === 'RMA')
  await Promise.allSettled(
    targets.map(async (c) => {
      try {
        const res = await api('/chat/threads', { query: { scope_type: c.type, scope_id: c.id } })
        if (res?.messages?.length) {
          registerActiveThread(c, res.messages)
        }
      } catch {
        /* ignore */
      }
    }),
  )
}

async function loadScopes() {
  const list = []
  try {
    const rmaRes = await api('/rmas', { query: { size: 8 } })
    for (const r of rmaRes?.items || []) {
      list.push({
        key: scopeKey('RMA', r.rma_id),
        type: 'RMA',
        id: r.rma_id,
        label: r.rma_id,
        sub: r.reported_part_no || r.defect_type || '',
      })
    }
  } catch {
    /* ignore */
  }
  if (!isCs.value) {
    try {
      const patRes = await api('/patterns')
      for (const p of (patRes?.patterns || []).slice(0, 5)) {
        list.push({
          key: scopeKey('PATTERN', p.pattern_id),
          type: 'PATTERN',
          id: p.pattern_id,
          label: `패턴 ${p.pattern_id}`,
          sub: p.defect_type || p.product || '',
        })
      }
    } catch {
      /* ignore */
    }
  }
  scopes.value = list

  const qRma = route.query.rmaId ? String(route.query.rmaId) : null
  const qPat = route.query.patternId ? String(route.query.patternId) : null
  if (qRma) {
    openChatFor('RMA', qRma, qRma)
  } else if (qPat && !isCs.value) {
    openChatFor('PATTERN', qPat, `패턴 ${qPat}`)
  } else {
    startNewGeneralChat()
  }

  probeActiveThreads(list)
}

function startNewGeneralChat() {
  threadSeq++
  activeScope.value = GENERAL_SCOPE
  threadId.value = null
  messages.value = []
  input.value = ''
  activeTab.value = 'chat'
}

function openChatFor(type, id, label = null) {
  if (type === 'GENERAL') {
    startNewGeneralChat()
    return
  }
  const key = scopeKey(type, id)
  let found = scopes.value.find((s) => s.key === key)
  if (!found) {
    found = {
      key,
      type,
      id,
      label: label || (type === 'PATTERN' ? `패턴 ${id}` : id),
      sub: '',
    }
    scopes.value.unshift(found)
  }
  activeScope.value = found
  activeTab.value = 'chat'
}

let threadSeq = 0
watch(
  activeScope,
  async (sc) => {
    const seq = ++threadSeq
    threadId.value = null
    messages.value = []
    if (!sc || sc.type === 'GENERAL') return
    try {
      const res = await api('/chat/threads', { query: { scope_type: sc.type, scope_id: sc.id } })
      if (seq !== threadSeq) return
      if (res?.thread_id) {
        threadId.value = res.thread_id
        messages.value = (res.messages || []).map((m, i) => ({
          id: `${res.thread_id}-${i}`,
          role: m.role === 'user' ? 'user' : 'bot',
          text: m.text,
          evidence: Array.isArray(m.evidence) ? m.evidence : [],
          suggestions: Array.isArray(m.suggestions) ? m.suggestions : [],
        }))
        if (messages.value.length) registerActiveThread(sc, messages.value)
        scrollBottom()
      }
    } catch {
      /* ignore */
    }
  },
)

async function sendText(raw) {
  const text = raw.trim()
  if (!text || busy.value) return

  const sc = activeScope.value || GENERAL_SCOPE
  messages.value.push({ id: Date.now() + Math.random(), role: 'user', text })
  const botMsg = { id: Date.now() + Math.random(), role: 'bot', text: '', loading: true, evidence: [], suggestions: [] }
  messages.value.push(botMsg)
  registerActiveThread(sc, messages.value)
  scrollBottom()

  busy.value = true
  try {
    const scopePayload = sc.type === 'GENERAL' ? { type: 'GENERAL' } : { type: sc.type, id: sc.id }
    const body = {
      message: text,
      scope: scopePayload,
      ...(threadId.value ? { thread_id: threadId.value } : {}),
    }
    const res = await api('/chat', { method: 'POST', body })
    if (res?.thread_id) threadId.value = res.thread_id
    botMsg.text = res.answer
    botMsg.evidence = res.evidence || []
    botMsg.suggestions = res.suggestions || []
    registerActiveThread(sc, messages.value)
  } catch (e) {
    botMsg.error =
      e.status === 503
        ? 'AI 일시 불가 상태입니다. 잠시 후 다시 시도해 주세요.'
        : e.status === 429
          ? '요청이 많습니다. 잠시 후 다시 질문해 주세요.'
          : e.message
  } finally {
    botMsg.loading = false
    busy.value = false
    scrollBottom()
  }
}

function submit() {
  const t = input.value
  if (!t.trim() || busy.value) return
  input.value = ''
  sendText(t)
}

// ---- 모바일 최적화 서브 페이지 로더 ----
async function loadRmas() {
  rmaLoading.value = true
  try {
    const res = await api('/rmas', { query: { size: 25, ...(rmaQuery.value.trim() ? { q: rmaQuery.value.trim() } : {}) } })
    rmaList.value = res?.items || []
  } catch {
    rmaList.value = []
  } finally {
    rmaLoading.value = false
  }
}

async function loadPatterns() {
  patternLoading.value = true
  try {
    const res = await api('/patterns')
    patternList.value = res?.patterns || []
  } catch {
    patternList.value = []
  } finally {
    patternLoading.value = false
  }
}

async function loadApprovals() {
  approvalLoading.value = true
  try {
    const res = await api('/approvals', { query: { status: 'PENDING', page: 1, size: 25 } })
    approvalList.value = res?.items || []
  } catch {
    approvalList.value = []
  } finally {
    approvalLoading.value = false
  }
}

async function loadAlerts() {
  alertLoading.value = true
  try {
    const res = await api('/alerts', { query: { limit: 40 } })
    alertList.value = Array.isArray(res) ? res : res?.items || []
  } catch {
    alertList.value = []
  } finally {
    alertLoading.value = false
  }
}

async function loadActions() {
  actionLoading.value = true
  try {
    const res = await api('/recurrence/actions', { query: { size: 40 } })
    actionList.value = res?.items || []
  } catch {
    actionList.value = []
  } finally {
    actionLoading.value = false
  }
}

async function onAlertClick(al) {
  expandedAlertId.value = expandedAlertId.value === al.id ? null : al.id
  if (!al.read) {
    al.read = true
    api(`/alerts/${al.id}/read`, { method: 'POST' }).catch(() => {})
  }
}

async function toggleAlertStar(al) {
  al.starred = !al.starred
  api(`/alerts/${al.id}/star`, { method: 'POST' }).catch(() => {
    al.starred = !al.starred
  })
}

function jumpToAlertTarget(al) {
  if (al.rma_id) {
    openChatFor('RMA', al.rma_id, al.rma_id)
    return
  }
  if (al.pattern_id) {
    openChatFor('PATTERN', al.pattern_id, `패턴 ${al.pattern_id}`)
    return
  }
  if (al.recur_id) {
    highlightedActionId.value = al.recur_id
    alertSubTab.value = 'actions'
    if (!actionList.value.length) loadActions()
  }
}

function alertToneClass(type) {
  if (['고위험', '급증', '반복 재발'].includes(type)) return 'border-red-400/35 bg-red-500/15 text-red-200'
  if (['재발 의심', '확산형'].includes(type)) return 'border-amber-400/35 bg-amber-500/15 text-amber-200'
  return 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200'
}

watch(activeTab, (tab) => {
  if (tab === 'rmas' && !rmaList.value.length) loadRmas()
  if (tab === 'patterns' && !patternList.value.length) loadPatterns()
  if (tab === 'approvals' && !approvalList.value.length) loadApprovals()
  if (tab === 'alerts') {
    if (!alertList.value.length) loadAlerts()
    if (!actionList.value.length) loadActions()
  }
})

function handleSelectTab(tab) {
  if (tab === 'chat') {
    startNewGeneralChat()
    return
  }
  activeTab.value = tab
}

function handleSelectThread(item) {
  openChatFor(item.type, item.id, item.label)
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  clearSession()
  router.push('/login')
}

onMounted(() => {
  loadScopes()
  requestAnimationFrame(() => {
    revealed.value = true
  })
})
</script>

<template>
  <div
    class="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#04050c] text-[#eef0f6]"
    style="font-family: 'Onest', 'Pretendard Variable', Pretendard, -apple-system, sans-serif"
  >
    <!-- Flowstate WebGL 유체 배경 -->
    <FluidBg :dimmed="activeTab !== 'chat' || messages.length > 0" />

    <!-- 좌측 ChatGPT 스타일 스프링 사이드바 드로어 -->
    <MobileSidebar
      :open="sidebarOpen"
      :active-tab="activeTab"
      :active-scope-key="activeScope?.key || ''"
      :is-cs="isCs"
      :user="auth.user"
      :rma-threads="rmaThreads"
      :pattern-threads="patternThreads"
      @close="sidebarOpen = false"
      @select-tab="handleSelectTab"
      @select-thread="handleSelectThread"
      @logout="logout"
    />

    <!-- 상단 글래스 헤더 -->
    <header
      class="relative z-20 flex shrink-0 items-center justify-between px-4 pb-2.5 pt-[max(0.875rem,env(safe-area-inset-top))] transition-all duration-700"
      :class="revealed ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'"
    >
      <div class="flex items-center gap-2.5">
        <button
          class="grid size-9 place-items-center rounded-full border border-white/16 bg-white/[0.08] text-[#eef0f6] backdrop-blur-md transition active:scale-95 hover:bg-white/[0.15]"
          aria-label="메뉴 열기"
          @click="sidebarOpen = true"
        >
          <PanelLeft class="size-4" />
        </button>

        <div class="flex items-center gap-2">
          <span class="text-[16px] font-medium tracking-[-0.01em] text-white">{{ tabTitle }}</span>
          <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-[#b9becf] backdrop-blur-md">
            {{ isCs ? 'CS' : 'QA' }}
          </span>
        </div>
      </div>

      <span
        v-if="activeTab === 'chat' && activeScope"
        class="max-w-[140px] truncate rounded-full border border-white/14 bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-[#b9becf] backdrop-blur-md"
      >
        {{ activeScope.label }}
      </span>
    </header>

    <!-- ===================== 1. AI 채팅 탭 ===================== -->
    <template v-if="activeTab === 'chat'">
      <!-- 범용 + RMA / 불량 패턴 선택 바 -->
      <div class="relative z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
        <button
          class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition"
          :class="
            activeScope?.type === 'GENERAL'
              ? 'border-white/80 bg-white text-[#1c1d22] shadow-sm'
              : 'border-white/15 bg-white/8 text-[#b9becf] hover:bg-white/14 hover:text-white'
          "
          @click="startNewGeneralChat"
        >
          범용 AI
        </button>
        <button
          v-for="sc in scopes"
          :key="sc.key"
          class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition"
          :class="
            activeScope?.key === sc.key
              ? 'border-white/80 bg-white text-[#1c1d22] shadow-sm'
              : 'border-white/15 bg-white/8 text-[#b9becf] hover:bg-white/14 hover:text-white'
          "
          @click="activeScope = sc"
        >
          {{ sc.label }}
        </button>
      </div>

      <main ref="scroller" class="relative z-10 flex-1 overflow-y-auto px-4 pb-4">
        <!-- 대화 전: Flowstate 히어로 -->
        <div v-if="!messages.length" class="mx-auto flex min-h-full max-w-md flex-col items-center justify-center py-6 text-center">
          <p
            class="inline-flex items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3.5 py-1 text-[11.5px] text-[#b9becf] backdrop-blur-md transition-all duration-700"
            :class="revealed ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'"
            style="transition-delay: 220ms"
          >
            <Sparkles class="size-3 text-cyan-300" />
            {{ activeScope?.type === 'GENERAL' ? '범용 PCB 품질·CS 어시스턴트' : `${activeScope.label} RAG 분석 준비됨` }}
          </p>

          <h1 class="mt-4 text-[30px] font-medium leading-[1.15] tracking-[-0.02em] text-[#eef0f6] sm:text-[38px]">
            <span
              v-for="(w, i) in heroWords"
              :key="w"
              class="mr-[0.26em] inline-block transition-all duration-700"
              :class="revealed ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'"
              :style="{ transitionDelay: `${360 + i * 85}ms` }"
            >{{ w }}</span>
          </h1>

          <p class="mt-3 max-w-xs text-[13.5px] leading-relaxed text-[#b9becf]">
            <span
              v-for="(w, i) in subWords"
              :key="i"
              class="mr-[0.24em] inline-block transition-all duration-500"
              :class="revealed ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'"
              :style="{ transitionDelay: `${660 + i * 24}ms` }"
            >{{ w }}</span>
          </p>

          <div
            v-if="quickPrompts.length"
            class="mt-6 flex w-full flex-col gap-2 transition-all duration-700"
            :class="revealed ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'"
            style="transition-delay: 900ms"
          >
            <button
              v-for="qp in quickPrompts"
              :key="qp.label"
              class="flex items-center justify-between rounded-2xl border border-white/14 bg-white/[0.07] px-4 py-3 text-left text-[13px] text-[#eef0f6] backdrop-blur-md transition active:scale-[0.99] hover:border-white/25 hover:bg-white/[0.12]"
              @click="sendText(qp.text)"
            >
              <span class="font-medium">{{ qp.label }}</span>
              <span class="text-xs text-[#b9becf]">↗</span>
            </button>
          </div>
        </div>

        <!-- 대화 중: ChatGPT 스타일 메시지 목록 -->
        <div v-else class="mx-auto flex max-w-xl flex-col gap-3.5 py-3">
          <template v-for="m in messages" :key="m.id">
            <div v-if="m.role === 'user'" class="flex justify-end">
              <div class="max-w-[82%] rounded-[20px] rounded-br-md bg-white px-4 py-2.5 text-[14px] font-medium leading-relaxed text-[#1c1d22] shadow-sm">
                {{ m.text }}
              </div>
            </div>

            <div v-else class="flex items-start gap-2.5">
              <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-cyan-200 backdrop-blur-md">
                <Bot class="size-4" />
              </span>
              <div class="min-w-0 flex-1 space-y-2">
                <div
                  v-if="m.loading"
                  class="inline-flex items-center gap-1.5 rounded-[18px] border border-white/14 bg-[#0b0e1c]/80 px-4 py-3 text-xs text-[#b9becf] backdrop-blur-md"
                >
                  <span class="size-1.5 animate-pulse rounded-full bg-cyan-300" />
                  <span class="size-1.5 animate-pulse rounded-full bg-violet-300 [animation-delay:150ms]" />
                  <span class="size-1.5 animate-pulse rounded-full bg-fuchsia-300 [animation-delay:300ms]" />
                  <span class="ml-1">근거 검색 및 답변 생성 중…</span>
                </div>

                <div
                  v-else-if="m.error"
                  class="rounded-2xl border border-red-400/30 bg-red-950/60 px-4 py-2.5 text-[13.5px] text-red-200 backdrop-blur-md"
                >
                  {{ m.error }}
                </div>

                <template v-else>
                  <div class="rounded-[20px] rounded-tl-md border border-white/14 bg-[#0d1020]/78 px-4 py-3 text-[14px] leading-[1.65] text-[#eef0f6] backdrop-blur-md">
                    {{ m.text }}
                  </div>

                  <div v-if="m.evidence?.length" class="flex flex-wrap gap-1.5">
                    <template v-for="(ev, idx) in m.evidence" :key="ev.rma_id || `${ev.type}-${idx}`">
                      <button
                        v-if="ev.rma_id"
                        class="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11.5px] text-cyan-100 backdrop-blur-md transition hover:bg-cyan-400/20"
                        @click="openChatFor('RMA', ev.rma_id, ev.rma_id)"
                      >
                        <b class="font-semibold">{{ ev.rma_id }}</b>
                        <span v-if="ev.label" class="max-w-[160px] truncate opacity-80">{{ ev.label }}</span>
                      </button>
                      <span
                        v-else
                        class="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11.5px] text-[#b9becf] backdrop-blur-md"
                      >
                        <b class="text-white/90">기준</b>
                        <span class="max-w-[180px] truncate">{{ ev.label }}</span>
                      </span>
                    </template>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </main>

      <!-- 하단 입력 바 -->
      <footer class="relative z-20 shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <form
          class="mx-auto flex h-[54px] max-w-xl items-center rounded-full border border-white/18 bg-white/[0.09] pl-4 pr-1.5 shadow-lg backdrop-blur-xl"
          @submit.prevent="submit"
        >
          <input
            ref="inputEl"
            v-model="input"
            :disabled="busy"
            :placeholder="activeScope?.type === 'GENERAL' ? '무엇이든 물어보세요…' : `${activeScope.label}에 대해 물어보세요…`"
            class="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#eef0f6] placeholder:text-[#b9becf]/80 focus:outline-none"
          />
          <button
            type="submit"
            :disabled="busy || !input.trim()"
            aria-label="질문 전송"
            class="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#2f2f33] shadow-sm transition hover:bg-white/85 disabled:opacity-35"
          >
            <ArrowUp class="size-4.5 stroke-[2.4]" />
          </button>
        </form>
      </footer>
    </template>

    <!-- ===================== 2. 모바일 RMA 조회 탭 ===================== -->
    <main v-else-if="activeTab === 'rmas'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-3">
        <form class="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 backdrop-blur-md" @submit.prevent="loadRmas">
          <Search class="size-4 shrink-0 text-[#b9becf]" />
          <input
            v-model="rmaQuery"
            placeholder="RMA 번호, 품번, 고객사 검색…"
            class="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder:text-[#b9becf]/70 focus:outline-none"
          />
        </form>

        <div v-if="rmaLoading" class="py-10 text-center text-xs text-[#b9becf]">RMA 목록을 불러오는 중…</div>
        <div v-else-if="!rmaList.length" class="py-10 text-center text-xs text-[#b9becf]">조회된 RMA가 없습니다.</div>
        <div v-else class="space-y-2.5">
          <div
            v-for="r in rmaList"
            :key="r.rma_id"
            class="rounded-2xl border border-white/12 bg-[#0b0f1f]/78 p-3.5 backdrop-blur-md"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <FileSearch class="size-4 text-cyan-300" />
                <span class="text-[14px] font-semibold text-white">{{ r.rma_id }}</span>
              </div>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] text-[#b9becf]">
                {{ r.status_label || r.status }}
              </span>
            </div>
            <p class="mt-1.5 text-[12.5px] text-[#b9becf]">
              {{ r.reported_part_no || '-' }} · {{ r.minor_name || r.defect_type || '유형 미지정' }}
            </p>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-[11px] text-[#b9becf]/65">{{ r.customer_name || '' }}</span>
              <button
                class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
                @click="openChatFor('RMA', r.rma_id, r.rma_id)"
              >
                <Sparkles class="size-3" />AI 분석 채팅
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ===================== 3. 모바일 불량 패턴 탭 (검색창 포함) ===================== -->
    <main v-else-if="activeTab === 'patterns'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-3">
        <div class="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 backdrop-blur-md">
          <Search class="size-4 shrink-0 text-[#b9becf]" />
          <input
            v-model="patternQuery"
            placeholder="패턴 ID, 제품, 불량 유형 검색…"
            class="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder:text-[#b9becf]/70 focus:outline-none"
          />
          <span v-if="patternList.length" class="shrink-0 text-[11px] text-[#b9becf]/70">
            {{ filteredPatterns.length }}건
          </span>
        </div>

        <div v-if="patternLoading" class="py-10 text-center text-xs text-[#b9becf]">불량 패턴을 불러오는 중…</div>
        <div v-else-if="!filteredPatterns.length" class="py-10 text-center text-xs text-[#b9becf]">
          {{ patternQuery ? '검색 조건에 맞는 불량 패턴이 없습니다.' : '탐지된 불량 패턴이 없습니다.' }}
        </div>
        <div v-else class="space-y-2.5">
          <div
            v-for="p in filteredPatterns"
            :key="p.pattern_id"
            class="rounded-2xl border border-white/12 bg-[#0b0f1f]/78 p-3.5 backdrop-blur-md"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Layers class="size-4 text-violet-300" />
                <span class="text-[14px] font-semibold text-white">패턴 {{ p.pattern_id }}</span>
              </div>
              <span class="rounded-full border border-violet-300/30 bg-violet-400/15 px-2 py-0.5 text-[11px] text-violet-200">
                {{ p.total_count ?? p.count ?? 0 }}건
              </span>
            </div>
            <p class="mt-1.5 text-[12.5px] text-[#b9becf]">
              {{ p.product || p.part_no || '-' }} · {{ p.defect_type || p.minor_name || '' }}
            </p>
            <div class="mt-3 flex justify-end">
              <button
                class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
                @click="openChatFor('PATTERN', p.pattern_id, `패턴 ${p.pattern_id}`)"
              >
                <Sparkles class="size-3" />AI 패턴 분석
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ===================== 4. 모바일 원인 판정 탭 ===================== -->
    <main v-else-if="activeTab === 'approvals'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-2.5">
        <div v-if="approvalLoading" class="py-10 text-center text-xs text-[#b9becf]">판정 대기 목록을 불러오는 중…</div>
        <div v-else-if="!approvalList.length" class="py-10 text-center text-xs text-[#b9becf]">현재 원인 판정 대기 건이 없습니다.</div>
        <div
          v-for="a in approvalList"
          :key="a.rma_id || a.id"
          class="rounded-2xl border border-white/12 bg-[#0b0f1f]/78 p-3.5 backdrop-blur-md"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <ClipboardCheck class="size-4 text-emerald-300" />
              <span class="text-[14px] font-semibold text-white">{{ a.rma_id }}</span>
            </div>
            <span class="rounded-full border border-amber-300/30 bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">
              승인 대기
            </span>
          </div>
          <p class="mt-1.5 text-[12.5px] text-[#b9becf]">
            {{ a.primary_cause || a.defect_type || 'AI 분석 완료' }}
          </p>
          <div class="mt-3 flex justify-end">
            <button
              class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
              @click="openChatFor('RMA', a.rma_id, a.rma_id)"
            >
              AI 근거 확인 <ChevronRight class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- ===================== 5. 모바일 알림 및 재발 탭 (상세 정보 + 인터랙션 + 대책 서브탭) ===================== -->
    <main v-else-if="activeTab === 'alerts'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-3">
        <!-- 서브탭: 알림 센터 | 재발·대책 -->
        <div class="grid grid-cols-2 gap-1.5 rounded-full border border-white/14 bg-white/[0.06] p-1 backdrop-blur-md">
          <button
            class="rounded-full py-1.5 text-xs font-medium transition"
            :class="alertSubTab === 'alerts' ? 'bg-white text-[#1c1d22]' : 'text-[#b9becf] hover:text-white'"
            @click="alertSubTab = 'alerts'"
          >
            알림 센터 ({{ alertList.length }})
          </button>
          <button
            class="rounded-full py-1.5 text-xs font-medium transition"
            :class="alertSubTab === 'actions' ? 'bg-white text-[#1c1d22]' : 'text-[#b9becf] hover:text-white'"
            @click="alertSubTab = 'actions'"
          >
            재발 · 대책 ({{ actionList.length }})
          </button>
        </div>

        <!-- 5-A. 알림 센터 -->
        <template v-if="alertSubTab === 'alerts'">
          <div v-if="alertLoading" class="py-10 text-center text-xs text-[#b9becf]">알림을 불러오는 중…</div>
          <div v-else-if="!alertList.length" class="py-10 text-center text-xs text-[#b9becf]">최근 알림이 없습니다.</div>
          <div v-else class="space-y-2.5">
            <div
              v-for="al in alertList"
              :key="al.id"
              class="cursor-pointer rounded-2xl border bg-[#0b0f1f]/82 p-3.5 backdrop-blur-md transition active:scale-[0.995]"
              :class="expandedAlertId === al.id ? 'border-cyan-300/40' : 'border-white/12'"
              @click="onAlertClick(al)"
            >
              <!-- 상단: 유형 배지 + 대상 라벨 + 시간 + 즐겨찾기 -->
              <div class="flex items-center gap-2">
                <span v-if="!al.read" class="size-2 shrink-0 rounded-full bg-rose-400" />
                <span class="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium" :class="alertToneClass(al.type)">
                  {{ al.type || '알림' }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-white">
                  {{ al.target_label || al.title || al.rma_id || '상세 확인' }}
                </span>
                <span class="shrink-0 text-[11px] text-[#b9becf]/65">{{ al.created_at ? timeAgo(al.created_at) : '' }}</span>
                <button
                  class="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/10"
                  :class="al.starred ? 'text-amber-300' : 'text-[#b9becf]/60'"
                  aria-label="즐겨찾기"
                  @click.stop="toggleAlertStar(al)"
                >
                  <Star class="size-3.5" :fill="al.starred ? 'currentColor' : 'none'" />
                </button>
              </div>

              <!-- 본문: 발생 사유(reason) + 먼저 확인(check_items) -->
              <p v-if="al.reason || al.message || al.summary" class="mt-2 text-[12.5px] leading-relaxed text-[#d7dce9]">
                {{ al.reason || al.message || al.summary }}
              </p>
              <div
                v-if="al.check_items"
                class="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-[#b9becf]"
              >
                <b class="font-semibold text-white/90">먼저 확인:</b> {{ al.check_items }}
              </div>

              <!-- 하단 액션: RMA/패턴 AI 분석 또는 연결 대책 보기 -->
              <div
                v-if="al.rma_id || al.pattern_id || al.recur_id"
                class="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5"
              >
                <span class="text-[11px] text-[#b9becf]/65">
                  {{ al.rma_id ? `연결 RMA: ${al.rma_id}` : al.pattern_id ? `연결 패턴: ${al.pattern_id}` : '연결 시정 대책 있음' }}
                </span>
                <button
                  class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
                  @click.stop="jumpToAlertTarget(al)"
                >
                  <Sparkles class="size-3" />
                  {{ al.rma_id || al.pattern_id ? 'AI 분석 채팅' : '대책 상세 보기' }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 5-B. 재발 · 대책 관리 -->
        <template v-else>
          <div v-if="actionLoading" class="py-10 text-center text-xs text-[#b9becf]">대책 이력을 불러오는 중…</div>
          <div v-else-if="!actionList.length" class="py-10 text-center text-xs text-[#b9becf]">등록된 시정 대책이 없습니다.</div>
          <div v-else class="space-y-2.5">
            <div
              v-for="ac in actionList"
              :key="ac.corrective_action_id"
              class="rounded-2xl border bg-[#0b0f1f]/82 p-3.5 backdrop-blur-md"
              :class="highlightedActionId === ac.corrective_action_id ? 'border-cyan-300/50' : 'border-white/12'"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Wrench class="size-4 shrink-0 text-cyan-300" />
                  <span class="truncate text-[13.5px] font-semibold text-white">
                    {{ ac.title || ac.description || ac.rma_id || `대책 #${ac.corrective_action_id}` }}
                  </span>
                </div>
                <span class="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10.5px] text-[#eef0f6]">
                  {{ ACTION_STATUS[ac.verification_status] || ac.verification_status || '진행 중' }}
                </span>
              </div>
              <p class="mt-1.5 text-[12px] text-[#b9becf]">
                {{ ACTION_ROLE[ac.action_role] || ac.action_role || '대책' }}
                <span v-if="ac.owner_dept"> · {{ ac.owner_dept }}</span>
                <span v-if="ac.implemented_at"> · 시행 {{ fmtDate(ac.implemented_at) }}</span>
              </p>
              <div class="mt-2.5 flex items-center justify-between">
                <span class="text-[11.5px]" :class="ac.recurrence_count > 0 ? 'font-medium text-rose-300' : 'text-emerald-300'">
                  {{ ac.recurrence_count > 0 ? `시행 후 재발 ${ac.recurrence_count}건` : '시행 후 재발 없음' }}
                </span>
                <button
                  v-if="ac.rma_id"
                  class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
                  @click="openChatFor('RMA', ac.rma_id, ac.rma_id)"
                >
                  <Sparkles class="size-3" />AI 분석
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
