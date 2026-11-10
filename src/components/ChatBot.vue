<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bot, Minus, Send, Sparkles, X } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import { api } from '@/lib/api'
import { aiState, auth, chatContext } from '@/lib/state'

const router = useRouter()
const open = ref(false)
const input = ref('')
const loading = ref(false)
const slow = ref(false)
const messages = ref([]) // 화면 이동 중에도 유지 (세션 내)
const scroller = ref(null)
const contextOn = ref(true)

const suggestions = computed(() =>
  auth.user?.role === 'QUALITY'
    ? ['이 불량 주요 원인', '대책 후 재발 여부', 'PRD-A 펌웨어오류 주요 원인']
    : ['이 제품 과거 처리 이력', '평균 해결 소요일', 'PRD-D 성능저하 처리 이력'],
)
const ctxRma = computed(() => (contextOn.value ? chatContext.rmaId : null))

// 첫 인사: 창을 열면 잠깐 입력 중(…) 표시 후 인사말과 예시 질문을 보여 준다 (대화 기록에는 넣지 않음)
const greeting = ref(false)
let greetTimer = null
watch(open, (v) => {
  clearTimeout(greetTimer)
  if (v && !messages.value.length && !greeting.value) greetTimer = setTimeout(() => ((greeting.value = true), scroll()), 450)
})
const intro = computed(() =>
  auth.user?.role === 'QUALITY'
    ? '반품 사례를 근거로 불량의 주요 원인, 대책 후 재발 여부, 비슷한 과거 사례를 찾아 드려요.'
    : '고객 응대에 필요한 과거 처리 이력, 평균 해결 기간, 비슷한 사례의 응대 방법을 찾아 드려요.',
)

async function send(text = input.value) {
  text = text.trim()
  if (!text || loading.value) return
  input.value = ''
  messages.value.push({ role: 'user', text, ctx: ctxRma.value })
  loading.value = true
  slow.value = false
  const slowTimer = setTimeout(() => (slow.value = true), 3000)
  const ctrl = new AbortController()
  const abortTimer = setTimeout(() => ctrl.abort(), 15000)
  scroll()
  try {
    const res = await Promise.race([
      api('/chat', { method: 'POST', body: { message: text, rma_id: ctxRma.value } }),
      new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
    ])
    messages.value.push({ role: 'bot', text: res.answer, evidence: res.evidence })
  } catch (e) {
    const msg = e.message === 'timeout' ? '응답이 지연되어 중단했습니다.' : e.status === 429 ? '잠시 후 다시 질문해 주세요' : e.status === 503 ? 'AI 일시 불가' : e.message
    messages.value.push({ role: 'bot', text: msg, error: true, retry: text })
  } finally {
    clearTimeout(slowTimer)
    clearTimeout(abortTimer)
    loading.value = false
    scroll()
  }
}

function scroll() {
  nextTick(() => scroller.value && (scroller.value.scrollTop = scroller.value.scrollHeight))
}

function goRma(id) {
  router.push({ path: '/rmas', query: { open: id } })
}

function close() {
  open.value = false
  messages.value = []
  greeting.value = false
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-40">
    <div v-if="open" class="mb-3 flex h-[560px] w-[400px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div class="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles class="size-4" />
        <p class="text-sm font-semibold">RMA AI 어시스턴트</p>
        <div class="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="최소화" @click="open = false"><Minus class="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="닫기" @click="close"><X class="size-4" /></Button>
        </div>
      </div>
      <div v-if="ctxRma" class="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs">
        <span class="text-muted-foreground">질의 맥락</span>
        <span class="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 font-medium">
          {{ ctxRma }}
          <button aria-label="맥락 해제" @click="contextOn = false"><X class="size-3" /></button>
        </span>
      </div>
      <div ref="scroller" class="flex-1 space-y-3 overflow-y-auto p-4">
        <!-- 첫 인사 -->
        <div v-if="!greeting && !messages.length" class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="grid size-7 place-items-center rounded-full bg-brand-soft text-primary"><Bot class="size-4" /></span>
          <span class="flex gap-1"><i v-for="k in 3" :key="k" class="size-1.5 animate-bounce rounded-full bg-zinc-400" :style="{ animationDelay: k * 120 + 'ms' }" /></span>
        </div>
        <div v-else-if="greeting" class="flex gap-2">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><Bot class="size-4" /></span>
          <div class="min-w-0 max-w-[92%] space-y-2">
            <div class="rounded-lg rounded-tl-sm bg-muted px-3 py-2.5 text-sm leading-relaxed">
              <p class="font-semibold">안녕하세요, {{ auth.user?.name || '담당자' }}님. RMA AI 어시스턴트입니다.</p>
              <p class="mt-1 text-[#4a5160]">{{ intro }} 답변마다 근거 RMA를 함께 보여 드리니, 눌러서 바로 확인하세요.</p>
              <p v-if="ctxRma" class="mt-2 rounded-md bg-card px-2 py-1.5 text-xs text-[#4a5160]">
                지금 보고 계신 <b class="font-semibold text-foreground">{{ ctxRma }}</b> 기준으로 답변합니다. 위의 맥락 표시에서 ×를 누르면 전체 사례에서 찾습니다.
              </p>
            </div>
            <div v-if="!messages.length" class="space-y-1.5">
              <p class="px-1 text-[12px] font-medium text-muted-foreground">이렇게 물어보세요</p>
              <button
                v-for="q in suggestions" :key="q" :disabled="loading"
                class="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-[13px] font-medium hover:border-brand-line hover:bg-brand-soft"
                @click="send(q)"
              >
                <Sparkles class="size-3.5 shrink-0 text-primary" />{{ q }}
              </button>
            </div>
          </div>
        </div>
        <div v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'flex justify-end' : ''">
          <div v-if="m.role === 'user'" class="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{{ m.text }}</div>
          <div v-else class="max-w-[92%] space-y-2">
            <div :class="m.error ? 'border-red-200 bg-red-50 text-red-700' : 'bg-muted'" class="rounded-lg border-transparent px-3 py-2 text-sm">
              {{ m.text }}
              <Button v-if="m.retry" variant="link" size="xs" class="ml-1" @click="send(m.retry)">다시 시도</Button>
            </div>
            <div v-if="m.evidence?.length" class="rounded-lg border p-2">
              <p class="mb-1 text-[12px] font-medium text-muted-foreground">근거 RMA 및 조치 내역</p>
              <button v-for="ev in m.evidence" :key="ev.rma_id" class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted" @click="goRma(ev.rma_id)">
                <span class="font-medium underline underline-offset-2">{{ ev.rma_id }}</span>
                <span class="truncate text-muted-foreground">{{ ev.action }}</span>
              </button>
            </div>
          </div>
        </div>
        <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="flex gap-1"><i v-for="k in 3" :key="k" class="size-1.5 animate-bounce rounded-full bg-zinc-400" :style="{ animationDelay: k * 120 + 'ms' }" /></span>
          {{ slow ? '검색 중입니다…' : '' }}
        </div>
      </div>
      <div class="border-t p-3">
        <div v-if="messages.length" class="mb-2 flex flex-wrap gap-1.5">
          <button v-for="s in suggestions" :key="s" class="rounded-full border px-2.5 py-1 text-[12px] hover:bg-muted" :disabled="loading" @click="send(s)">{{ s }}</button>
        </div>
        <form class="flex gap-2" @submit.prevent="send()">
          <input v-model="input" :disabled="loading" placeholder="질문을 입력하세요 (Enter 전송)" class="h-9 flex-1 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          <Button type="submit" size="icon" :disabled="loading || !input.trim()" aria-label="전송"><Send class="size-4" /></Button>
        </form>
      </div>
    </div>
    <div class="flex justify-end">
      <button
        :disabled="!aiState.available"
        :title="aiState.available ? 'AI 챗봇' : 'AI 일시 불가'"
        class="flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_10px_28px_#ea002c40] transition hover:-translate-y-0.5 disabled:opacity-40"
        @click="open = !open; contextOn = true"
      >
        <Sparkles class="size-4" />AI 어시스턴트
      </button>
    </div>
  </div>
</template>
