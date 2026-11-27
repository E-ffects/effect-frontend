<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowUp, Bot, LayoutGrid, LogOut, Sparkles } from 'lucide-vue-next'
import FluidBg from '@/components/FluidBg.vue'
import { api } from '@/lib/api'
import { auth, clearSession } from '@/lib/state'

// 모바일 QR 시연용 Flowstate 다크 + ChatGPT 스타일 풀스크린 RAG 채팅
const route = useRoute()
const router = useRouter()

const isCs = computed(() => auth.user?.role === 'CS')
const scopes = ref([]) // [{ type: 'RMA'|'PATTERN', id, label, sub, from?, to? }]
const activeIdx = ref(0)
const activeScope = computed(() => scopes.value[activeIdx.value] || null)

const messages = ref([])
const threadId = ref(null)
const input = ref('')
const busy = ref(false)
const revealed = ref(false)
const scroller = ref(null)
const inputEl = ref(null)

const heroWords = ['무엇을', '분석해', '드릴까요?']
const subWords = ['선택된', 'PCB', '사례와', '사내', '품질', '기준을', '바탕으로', '즉시', '답변합니다.']

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

function scrollBottom() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

async function loadScopes() {
  const list = []
  try {
    const rmaRes = await api('/rmas', { query: { size: 6 } })
    for (const r of rmaRes?.items || []) {
      list.push({
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
      for (const p of (patRes?.patterns || []).slice(0, 4)) {
        list.push({
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

  // QR 쿼리에 rmaId 또는 patternId가 있으면 해당 대상을 기본 선택
  const qRma = route.query.rmaId ? String(route.query.rmaId) : null
  const qPat = route.query.patternId ? String(route.query.patternId) : null
  if (qRma) {
    const idx = list.findIndex((s) => s.type === 'RMA' && s.id === qRma)
    if (idx >= 0) activeIdx.value = idx
    else {
      list.unshift({ type: 'RMA', id: qRma, label: qRma, sub: '' })
      activeIdx.value = 0
    }
  } else if (qPat && !isCs.value) {
    const idx = list.findIndex((s) => s.type === 'PATTERN' && s.id === qPat)
    if (idx >= 0) activeIdx.value = idx
  }
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
  if (!text || busy.value) return
  if (!activeScope.value) return

  messages.value.push({ id: Date.now() + Math.random(), role: 'user', text })
  const botMsg = { id: Date.now() + Math.random(), role: 'bot', text: '', loading: true, evidence: [], suggestions: [] }
  messages.value.push(botMsg)
  scrollBottom()

  busy.value = true
  try {
    const sc = activeScope.value
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
  } catch (e) {
    botMsg.error = e.status === 503 ? 'AI 일시 불가 상태입니다. 잠시 후 다시 시도해 주세요.' : e.status === 429 ? '요청이 많습니다. 잠시 후 다시 질문해 주세요.' : e.message
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

function selectRmaFromEvidence(rmaId) {
  const idx = scopes.value.findIndex((s) => s.type === 'RMA' && s.id === rmaId)
  if (idx >= 0) {
    activeIdx.value = idx
  } else {
    scopes.value.unshift({ type: 'RMA', id: rmaId, label: rmaId, sub: '' })
    activeIdx.value = 0
  }
}

function openDesktopDashboard() {
  router.push(isCs.value ? '/cs/dashboard' : '/quality/dashboard')
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  clearSession()
  router.push('/login')
}

onMounted(() => {
  loadScopes()
  requestAnimationFrame(() => { revealed.value = true })
})
</script>

<template>
  <div
    class="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#04050c] text-[#eef0f6]"
    style="font-family: 'Onest', 'Pretendard Variable', Pretendard, -apple-system, sans-serif"
  >
    <!-- Flowstate WebGL 유체 배경 -->
    <FluidBg :dimmed="messages.length > 0" />

    <!-- 상단 글래스 헤더 -->
    <header
      class="relative z-20 flex shrink-0 items-center justify-between px-4 pb-2.5 pt-3.5 transition-all duration-700"
      :class="revealed ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'"
    >
      <div class="flex items-center gap-2">
        <svg class="size-5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2.5 9c2.5 0 2.5 4.2 5 4.2S10 9 12 9s2.5 4.2 5 4.2S19.5 9 21.5 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <path d="M2.5 15c2.5 0 2.5 4.2 5 4.2S10 15 12 15s2.5 4.2 5 4.2S19.5 15 21.5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.5" />
        </svg>
        <span class="text-[16px] font-medium tracking-[-0.01em] text-white">E!ffect AI</span>
        <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-[#b9becf] backdrop-blur-md">
          {{ isCs ? 'CS' : 'QA' }}
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          class="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3 text-xs font-medium text-[#eef0f6] backdrop-blur-md transition hover:bg-white/15"
          @click="openDesktopDashboard"
        >
          <LayoutGrid class="size-3.5" />전체 화면
        </button>
        <button
          class="grid size-8 place-items-center rounded-full border border-white/16 bg-white/8 text-[#b9becf] backdrop-blur-md transition hover:bg-white/15 hover:text-white"
          aria-label="로그아웃"
          @click="logout"
        >
          <LogOut class="size-3.5" />
        </button>
      </div>
    </header>

    <!-- 대상 RMA / 불량 패턴 선택 바 (가로 스크롤 글래스 알약) -->
    <div v-if="scopes.length" class="relative z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
      <button
        v-for="(sc, idx) in scopes"
        :key="`${sc.type}-${sc.id}`"
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

    <!-- 메인 영역: 빈 화면(Flowstate 히어로) 또는 채팅 스레드(ChatGPT 모바일) -->
    <main ref="scroller" class="relative z-10 flex-1 overflow-y-auto px-4 pb-4">
      <!-- 대화 전: Flowstate 단어별 리빌 히어로 -->
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

        <!-- 원클릭 추천 질문 글래스 칩 -->
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

      <!-- 대화 중: ChatGPT 모바일 스타일 메시지 목록 -->
      <div v-else class="mx-auto flex max-w-xl flex-col gap-3.5 py-3">
        <template v-for="m in messages" :key="m.id">
          <!-- 사용자 말풍선 -->
          <div v-if="m.role === 'user'" class="flex justify-end">
            <div class="max-w-[82%] rounded-[20px] rounded-br-md bg-white px-4 py-2.5 text-[14px] font-medium leading-relaxed text-[#1c1d22] shadow-sm">
              {{ m.text }}
            </div>
          </div>

          <!-- AI 어시스턴트 말풍선 -->
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

                <!-- RAG 근거 칩 -->
                <div v-if="m.evidence?.length" class="flex flex-wrap gap-1.5">
                  <template v-for="(ev, idx) in m.evidence" :key="ev.rma_id || `${ev.type}-${idx}`">
                    <button
                      v-if="ev.rma_id"
                      class="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11.5px] text-cyan-100 backdrop-blur-md transition hover:bg-cyan-400/20"
                      @click="selectRmaFromEvidence(ev.rma_id)"
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

    <!-- 하단 Flowstate 글래스 입력 바 -->
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
  </div>
</template>
