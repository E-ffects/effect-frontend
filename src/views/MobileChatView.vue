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
} from 'lucide-vue-next'
import FluidBg from '@/components/FluidBg.vue'
import MobileSidebar from '@/components/MobileSidebar.vue'
import { api } from '@/lib/api'
import { auth, clearSession } from '@/lib/state'

// 모바일 전용 Flowstate 다크 + ChatGPT 스타일 통합 뷰 (/m)
const route = useRoute()
const router = useRouter()

const isCs = computed(() => auth.user?.role === 'CS')
const sidebarOpen = ref(false)
const activeTab = ref('chat') // 'chat' | 'rmas' | 'patterns' | 'approvals' | 'alerts'

// 스코프 목록 (상단 선택 칩) & 실제 채팅 이력이 있는 항목들 ("채팅 한 것만")
const scopes = ref([]) // [{ key, type: 'RMA'|'PATTERN', id, label, sub }]
const activeIdx = ref(0)
const activeScope = computed(() => scopes.value[activeIdx.value] || null)
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

// 모바일 최적화 페이지 데이터 (RMA 조회 / 불량 패턴 / 원인 판정 / 알림)
const rmaList = ref([])
const rmaQuery = ref('')
const rmaLoading = ref(false)

const patternList = ref([])
const patternLoading = ref(false)

const approvalList = ref([])
const approvalLoading = ref(false)

const alertList = ref([])
const alertLoading = ref(false)

const heroWords = ['무엇을', '분석해', '드릴까요?']
const subWords = ['선택된', 'PCB', '사례와', '사내', '품질', '기준을', '바탕으로', '즉시', '답변합니다.']

const tabTitle = computed(() => {
  if (activeTab.value === 'rmas') return 'RMA 조회'
  if (activeTab.value === 'patterns') return '불량 패턴 분석'
  if (activeTab.value === 'approvals') return '원인 판정'
  if (activeTab.value === 'alerts') return '알림 및 재발'
  return 'E!ffect AI'
})

const quickPrompts = computed(() => {
  const sc = activeScope.value
  if (!sc) return []
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
  return `${type}:${id}`
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
  if (!sc || !msgs?.length) return
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
  // 저장된 이력 + 로드된 스코프를 합쳐 실제 메시지가 있는 스레드만 좌측 사이드바에 등록
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
  }

  probeActiveThreads(list)
}

function openChatFor(type, id, label = null) {
  const key = scopeKey(type, id)
  let idx = scopes.value.findIndex((s) => s.key === key)
  if (idx < 0) {
    scopes.value.unshift({
      key,
      type,
      id,
      label: label || (type === 'PATTERN' ? `패턴 ${id}` : id),
      sub: '',
    })
    idx = 0
  }
  activeIdx.value = idx
  activeTab.value = 'chat'
}

let threadSeq = 0
watch(
  activeScope,
  async (sc) => {
    const seq = ++threadSeq
    threadId.value = null
    messages.value = []
    if (!sc) return
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
  { immediate: true },
)

async function sendText(raw) {
  const text = raw.trim()
  if (!text || busy.value || !activeScope.value) return

  const sc = activeScope.value
  messages.value.push({ id: Date.now() + Math.random(), role: 'user', text })
  const botMsg = { id: Date.now() + Math.random(), role: 'bot', text: '', loading: true, evidence: [], suggestions: [] }
  messages.value.push(botMsg)
  registerActiveThread(sc, messages.value)
  scrollBottom()

  busy.value = true
  try {
    const body = {
      message: text,
      scope: { type: sc.type, id: sc.id },
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
    const res = await api('/alerts', { query: { limit: 30 } })
    alertList.value = Array.isArray(res) ? res : res?.items || []
  } catch {
    alertList.value = []
  } finally {
    alertLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'rmas' && !rmaList.value.length) loadRmas()
  if (tab === 'patterns' && !patternList.value.length) loadPatterns()
  if (tab === 'approvals' && !approvalList.value.length) loadApprovals()
  if (tab === 'alerts' && !alertList.value.length) loadAlerts()
})

function handleSelectTab(tab) {
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

    <!-- 상단 글래스 헤더 (전체 화면 버튼 없음 — 모바일 전용) -->
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
      <!-- 대상 RMA / 불량 패턴 선택 바 -->
      <div v-if="scopes.length" class="relative z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
        <button
          v-for="(sc, idx) in scopes"
          :key="sc.key"
          class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition"
          :class="
            idx === activeIdx
              ? 'border-white/80 bg-white text-[#1c1d22] shadow-sm'
              : 'border-white/15 bg-white/8 text-[#b9becf] hover:bg-white/14 hover:text-white'
          "
          @click="activeIdx = idx"
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
            {{ activeScope ? `${activeScope.label} RAG 분석 준비됨` : 'PCB RMA RAG Assistant' }}
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
            :disabled="busy || !activeScope"
            :placeholder="activeScope ? `${activeScope.label}에 대해 물어보세요…` : '대상을 불러오는 중…'"
            class="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#eef0f6] placeholder:text-[#b9becf]/80 focus:outline-none"
          />
          <button
            type="submit"
            :disabled="busy || !input.trim() || !activeScope"
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
              {{ r.reported_part_no || '-' }} · {{ r.defect_type || '유형 미지정' }}
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

    <!-- ===================== 3. 모바일 불량 패턴 탭 ===================== -->
    <main v-else-if="activeTab === 'patterns'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-2.5">
        <div v-if="patternLoading" class="py-10 text-center text-xs text-[#b9becf]">불량 패턴을 불러오는 중…</div>
        <div v-else-if="!patternList.length" class="py-10 text-center text-xs text-[#b9becf]">탐지된 불량 패턴이 없습니다.</div>
        <div
          v-for="p in patternList"
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
            {{ p.product || p.part_no || '-' }} · {{ p.defect_type || '' }}
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

    <!-- ===================== 5. 모바일 알림 및 재발 탭 ===================== -->
    <main v-else-if="activeTab === 'alerts'" class="relative z-10 flex-1 overflow-y-auto px-4 pb-6">
      <div class="mx-auto max-w-xl space-y-2.5">
        <div v-if="alertLoading" class="py-10 text-center text-xs text-[#b9becf]">알림을 불러오는 중…</div>
        <div v-else-if="!alertList.length" class="py-10 text-center text-xs text-[#b9becf]">최근 알림이 없습니다.</div>
        <div
          v-for="al in alertList"
          :key="al.id"
          class="rounded-2xl border border-white/12 bg-[#0b0f1f]/78 p-3.5 backdrop-blur-md"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Bell class="size-4 text-cyan-300" />
              <span class="text-[13.5px] font-medium text-white">{{ al.title || al.type || '알림' }}</span>
            </div>
            <span v-if="!al.read" class="size-2 rounded-full bg-cyan-400" />
          </div>
          <p v-if="al.message || al.summary" class="mt-1.5 text-[12.5px] leading-relaxed text-[#b9becf]">
            {{ al.message || al.summary }}
          </p>
          <div v-if="al.rma_id || al.pattern_id" class="mt-3 flex justify-end">
            <button
              class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-[#1c1d22] transition active:scale-95"
              @click="al.pattern_id ? openChatFor('PATTERN', al.pattern_id, `패턴 ${al.pattern_id}`) : openChatFor('RMA', al.rma_id, al.rma_id)"
            >
              <Sparkles class="size-3" />AI 분석
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
