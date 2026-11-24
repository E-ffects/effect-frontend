<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, CheckCircle2, ChevronRight, ClipboardCheck, FilePlus2, Lock, PauseCircle, RefreshCw, Search, Send, Sparkles } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import StreamBubble from './StreamBubble.vue'
import RmaSphere from './RmaSphere.vue'
import { S, animate, clamp, settled, snap, step, stop, vSpringIn } from '@/lib/spring'
import { api } from '@/lib/api'
import { fetchAnalysis, fetchProgress, fetchSimilar } from '@/lib/agent'
import { agentPanel, aiState, auth, chatContext, setAgentPanelOpen } from '@/lib/state'

// 오른쪽 에이전트 패널: 현재 보고 있는 RMA(chatContext.rmaId)를 기준으로 작업을 요청한다.
// 화면 전환은 기존 라우트를 그대로 쓴다: 접수 /cs/intake, 사례 열기 /rmas?open=<RMA_ID>
const route = useRoute()
const router = useRouter()
const isCs = computed(() => auth.user?.role === 'CS')
const target = computed(() => chatContext.rmaId)
const thread = computed(() => agentPanel.thread)
const scroller = ref(null)
const busy = ref(false)

const tasks = computed(() => [
  isCs.value && { key: 'intake', icon: FilePlus2, title: '새 반품 접수', desc: '왼쪽에 접수 폼을 엽니다', needsTarget: false },
  { key: 'similar', icon: Search, title: '유사 사례 찾기', desc: '현재 RMA 기준 과거 사례 조회', needsTarget: true },
  {
    key: 'analysis', icon: ClipboardCheck, title: '분석 결과 보기', needsTarget: true,
    desc: isCs.value ? '왼쪽에 고객 응대 상세를 엽니다' : '왼쪽에 원인·근거·승인 항목을 엽니다',
  },
].filter(Boolean))

function push(msg) {
  // fresh: 이 화면에서 방금 생긴 메시지 → 올라오며 나타나고, 답변은 단어 단위로 흐른다 (다 나오면 false)
  agentPanel.thread.push({ id: Date.now() + Math.random(), fresh: true, ...msg })
  scroll()
  const added = agentPanel.thread.at(-1)
  // 화면을 옮겨 패널이 다시 그려져도 등장 움직임이 반복되지 않게. 기다리던 답은 도착하면 그대로 흐른다
  setTimeout(() => (added.fresh = false), 1500)
  return added
}

function scroll() {
  nextTick(() => scroller.value && (scroller.value.scrollTop = scroller.value.scrollHeight))
}

const openRma = (id) => router.push({ path: '/rmas', query: { open: id } })

async function run(t) {
  if (busy.value || (t.needsTarget && !target.value)) return
  push({ role: 'user', text: t.title })
  if (t.key === 'intake') {
    router.push({ path: '/cs/intake', query: { from: 'agent' } })
    push({ role: 'bot', kind: 'text', text: '왼쪽에 접수 폼을 열었습니다. 저장하면 새 RMA 상세로 이동하고, 여기에 분석 진행 상태를 보여 드립니다.' })
    return
  }
  const rmaId = target.value
  const msg = push({ role: 'bot', kind: t.key, rmaId, loading: true })
  busy.value = true
  try {
    if (t.key === 'similar') {
      msg.items = await fetchSimilar(rmaId)
      msg.view = isCs.value ? 'cs' : 'quality'
    } else {
      if (route.path !== '/rmas' || route.query.open !== rmaId) openRma(rmaId)
      msg.result = await fetchAnalysis(rmaId)
    }
  } catch (e) {
    msg.error = e.message
  } finally {
    msg.loading = false
    busy.value = false
    scroll()
  }
}

// 접수 화면이 저장에 성공하면 IntakeView가 agentPanel.intake 를 채운다 → 진행 상태 카드
watch(
  () => agentPanel.intake,
  async (res) => {
    if (!res) return
    agentPanel.intake = null
    const msg = push({ role: 'bot', kind: 'progress', rmaId: res.rma_id, loading: true, source: res })
    await refreshProgress(msg)
  },
)

async function refreshProgress(msg) {
  msg.loading = true
  msg.steps = await fetchProgress(msg.source)
  msg.loading = false
  scroll()
}

// 자유 입력: 기존 /chat 을 그대로 쓴다 (다음 버전에서 위 작업을 호출하도록 바꿀 예정)
const input = ref('')
const inputEl = ref(null)

// 빈 대화 화면의 RMA 구체를 누르면: 점이 RMA 글자로 모인 뒤 대화를 연다 (인사가 흐르고 입력칸에 커서)
function startChat() {
  const name = auth.user?.name || '담당자'
  const about = target.value ? `열려 있는 ${target.value}의 원인 후보, 비슷한 과거 사례, 처리 이력을 물어보세요.` : '왼쪽에서 RMA를 열면 그 사례를 기준으로 답합니다. 원인 후보, 비슷한 과거 사례, 처리 이력을 물어보세요.'
  push({ role: 'bot', kind: 'text', text: `${name}님, 무엇을 도와드릴까요? ${about}` })
  nextTick(() => inputEl.value?.focus())
}
async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  input.value = ''
  push({ role: 'user', text })
  const msg = push({ role: 'bot', kind: 'chat', loading: true })
  busy.value = true
  try {
    const res = await api('/chat', { method: 'POST', body: { message: text, rma_id: target.value } })
    msg.text = res.answer
    msg.evidence = res.evidence || []
  } catch (e) {
    msg.error = e.status === 503 ? 'AI 일시 불가' : e.status === 429 ? '잠시 후 다시 질문해 주세요' : e.message
  } finally {
    msg.loading = false
    busy.value = false
    scroll()
  }
}

const stepIcon = { done: CheckCircle2, hold: PauseCircle }

// 패널 접기·펴기: DesignBookmark "Sidebar Collapse"(sidebar-collapse/side.js)의 스프링을 그대로 쓴다.
// - 너비 하나의 스프링(260 24): 380px ↔ 64px. 안쪽 내용은 380px 그대로 두고 바깥만 줄여 잘라낸다
// - 펼칠 때 제목·분석 대상·작업 버튼·대화·입력이 위에서부터 0.04초 간격으로 차례로 나타난다(300 26). 접을 때는 한꺼번에
// - 접기 화살표가 반 바퀴 돌고(300 22), 접힌 띠(64px)에는 작업 아이콘이 남아 바로 누를 수 있다
// 좁은 화면(lg 미만)에서는 예전처럼 덮개 패널: 접으면 사라진다
const OPEN_W = 380
const RAIL_W = 64
const side = ref(null)
const toggleBtn = ref(null)
const logo = ref(null)
const rail = ref(null)
const cascade = []
const W = S(agentPanel.open ? OPEN_W : RAIL_W, 260, 24)
const R = S(agentPanel.open ? 0 : 1, 300, 22)
const labels = Array.from({ length: 10 }, () => S(agentPanel.open ? 1 : 0, 300, 26))
let cascadeTimers = []
const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : null

const panelMotion = {
  frame(dt) {
    step(W, dt)
    step(R, dt)
    labels.forEach((l) => step(l, dt))
  },
  render() {
    if (!side.value) return
    side.value.style.width = wide?.matches ? `${W.x.toFixed(2)}px` : ''
    const r = clamp(R.x, 0, 1)
    toggleBtn.value.firstElementChild.style.transform = `rotate(${(180 * R.x).toFixed(2)}deg)`
    toggleBtn.value.style.right = `${(14 + r * 4).toFixed(2)}px`
    logo.value.style.opacity = clamp(1 - R.x * 2, 0, 1).toFixed(3)
    rail.value.style.opacity = clamp(r * 1.6 - 0.6, 0, 1).toFixed(3)
    cascade.forEach((el, i) => {
      if (!el) return
      const o = clamp(labels[i].x, 0, 1)
      el.style.opacity = o.toFixed(3)
      el.style.transform = `translateX(${((1 - o) * -10).toFixed(2)}px)`
    })
  },
  idle: () => settled(W) && settled(R) && labels.every(settled),
}

watch(
  () => agentPanel.open,
  (o) => {
    cascadeTimers.forEach(clearTimeout)
    cascadeTimers = []
    W.t = o ? OPEN_W : RAIL_W
    R.t = o ? 0 : 1
    labels.forEach((l, i) =>
      o ? cascadeTimers.push(setTimeout(() => agentPanel.open && ((l.t = 1), animate(panelMotion)), (0.06 + i * 0.04) * 1000)) : (l.t = 0),
    )
    animate(panelMotion)
  },
)

// 접힌 띠의 작업 아이콘: 패널을 펴고 그 작업을 바로 실행
function runFromRail(t) {
  setAgentPanelOpen(true)
  run(t)
}

const onResize = () => panelMotion.render()
onMounted(() => {
  ;[W, R, ...labels].forEach(snap)
  panelMotion.render()
  wide?.addEventListener('change', onResize)
})
onBeforeUnmount(() => {
  cascadeTimers.forEach(clearTimeout)
  stop(panelMotion)
  wide?.removeEventListener('change', onResize)
})
</script>

<template>
  <aside
    ref="side"
    :class="agentPanel.open ? '' : 'max-lg:hidden'"
    class="fixed inset-y-0 right-0 z-40 w-[380px] max-w-full overflow-hidden border-l bg-card shadow-[-12px_0_32px_rgba(32,35,43,0.08)] lg:sticky lg:top-16 lg:z-10 lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:shadow-none"
    aria-label="에이전트 패널"
  >
    <!-- 접기·펴기 버튼: 늘 패널 오른쪽 위. 접히면 로고 자리에 온다 -->
    <button
      ref="toggleBtn"
      type="button"
      class="absolute top-2.5 z-20 grid size-7 place-items-center rounded-lg text-[#4a505c] transition-colors hover:bg-muted hover:text-foreground"
      :aria-expanded="agentPanel.open"
      :aria-label="agentPanel.open ? '패널 접기' : '패널 펴기'"
      :title="agentPanel.open ? '패널 접기' : '에이전트 패널 펴기'"
      @click="setAgentPanelOpen(!agentPanel.open)"
    >
      <ChevronRight class="size-4 will-change-transform" />
    </button>

    <!-- 접힌 띠: 작업 아이콘 -->
    <div ref="rail" :inert="agentPanel.open" class="absolute inset-y-0 left-0 z-10 flex w-16 flex-col items-center gap-1.5 border-r-0 pt-14 opacity-0">
      <span class="mb-1 h-px w-8 bg-border" />
      <button
        v-for="t in tasks"
        :key="t.key"
        type="button"
        :disabled="busy || (t.needsTarget && !target)"
        :title="t.needsTarget && !target ? `${t.title} (RMA를 열면 쓸 수 있습니다)` : t.title"
        :aria-label="t.title"
        class="grid size-10 place-items-center rounded-lg text-primary transition-colors hover:bg-brand-soft disabled:pointer-events-none disabled:opacity-40"
        @click="runFromRail(t)"
      >
        <component :is="t.icon" class="size-[18px]" />
      </button>
      <span v-if="target" class="mt-2 rotate-180 text-[11px] font-semibold text-muted-foreground tabular [writing-mode:vertical-rl]">{{ target }}</span>
    </div>

    <div :inert="!agentPanel.open" class="flex h-full w-[380px] max-w-full flex-col">
    <div class="flex items-center gap-2 border-b px-4 py-3">
      <span ref="logo" class="grid place-items-center"><Sparkles class="size-4" /></span>
      <p :ref="(el) => (cascade[0] = el)" class="text-sm font-semibold">RMA AI 어시스턴트</p>
      <span class="size-7" aria-hidden="true" />
    </div>

    <!-- 분석 대상 -->
    <div :ref="(el) => (cascade[1] = el)" class="flex items-center gap-2 whitespace-nowrap border-b bg-muted/50 px-4 py-2 text-xs">
      <span class="text-muted-foreground">분석 대상</span>
      <span v-if="target" class="tabular rounded-md border bg-card px-1.5 py-0.5 font-semibold">{{ target }}</span>
      <span v-else class="text-muted-foreground">RMA 조회에서 사례를 열면 지정됩니다</span>
      <span class="ml-auto rounded-[5px] bg-brand-soft px-1.5 py-0.5 font-semibold text-primary">{{ isCs ? 'CS 권한' : 'QA 권한' }}</span>
    </div>

    <!-- 작업 버튼 -->
    <div class="grid gap-1.5 border-b px-4 py-3">
      <button
        v-for="(t, i) in tasks"
        :key="t.key"
        :ref="(el) => (cascade[2 + i] = el)"
        :disabled="busy || (t.needsTarget && !target)"
        class="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-brand-line hover:bg-brand-soft disabled:pointer-events-none disabled:opacity-45"
        @click="run(t)"
      >
        <component :is="t.icon" class="size-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <b class="block text-[13px] font-semibold leading-tight">{{ t.title }}</b>
          <span class="text-[12px] text-muted-foreground">{{ t.desc }}</span>
        </span>
      </button>
    </div>

    <!-- 결과 -->
    <div :ref="(el) => ((scroller = el), (cascade[5] = el))" class="flex-1 space-y-3 overflow-y-auto p-4">
      <!-- 빈 대화: 숨 쉬는 RMA 구체. 누르면 글자로 모인 뒤 대화가 열린다 -->
      <div v-if="!thread.length" class="flex min-h-full flex-col items-center justify-center pb-6">
        <div class="h-[240px] w-full">
          <RmaSphere word="RMA" @activate="startChat" />
        </div>
        <p class="mt-1 text-[15px] font-bold">안녕하세요, {{ auth.user?.name || '담당자' }}님.</p>
        <p class="mt-1 text-center text-[13px] leading-relaxed text-[#6b717d]">
          구체를 누르면 RMA 어시스턴트와 대화를 시작합니다.<br />
          왼쪽에서 RMA를 열면 위 작업도 바로 쓸 수 있습니다.<template v-if="isCs"> 새 반품 접수는 지금 시작할 수 있습니다.</template>
        </p>
      </div>

      <template v-for="m in thread" :key="m.id">
        <div v-if="m.role === 'user'" v-spring-in="m.fresh ? { y: 14, scale: 0.92 } : null" class="flex justify-end">
          <div class="max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">{{ m.text }}</div>
        </div>

        <div v-else v-spring-in="m.fresh ? { y: 14 } : null" class="flex gap-2">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><Bot class="size-4" /></span>
          <div class="min-w-0 flex-1 space-y-2">
            <!-- 자유 입력 답변은 말풍선이 "답변 준비 중"부터 이어서 흐른다. 그 밖의 작업은 준비 중 알약만 -->
            <StreamBubble v-if="m.loading && m.kind !== 'chat'" loading />
            <div v-else-if="m.error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ m.error }}</div>

            <!-- 일반 안내 / 자유 입력 답변 -->
            <template v-else-if="m.kind === 'text' || m.kind === 'chat'">
              <StreamBubble :text="m.text" :loading="m.loading" :streaming="m.fresh" @grow="scroll" @finished="m.fresh = false" />
              <div v-if="m.evidence?.length" class="rounded-lg border p-2">
                <p class="mb-1 text-[12px] font-medium text-muted-foreground">근거 RMA 및 조치 내역</p>
                <button v-for="ev in m.evidence" :key="ev.rma_id" class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted" @click="openRma(ev.rma_id)">
                  <span class="font-medium underline underline-offset-2">{{ ev.rma_id }}</span>
                  <span class="truncate text-muted-foreground">{{ ev.action }}</span>
                </button>
              </div>
            </template>

            <!-- 유사 사례: 결과는 남겨 두고 사례 ID를 누르면 왼쪽에서 연다 -->
            <template v-else-if="m.kind === 'similar'">
              <div class="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                <p v-if="m.items.length"><b>{{ m.rmaId }}</b>와 비슷한 과거 사례 <b>{{ m.items.length }}건</b>을 찾았습니다.</p>
                <p v-else><b>{{ m.rmaId }}</b>와 비슷한 과거 사례를 찾지 못했습니다.</p>
                <p v-if="m.items.length" class="text-[12px] text-[#4a5160]">ID를 누르면 왼쪽에서 상세가 열립니다</p>
              </div>
              <div v-if="m.items.length" class="rounded-lg border p-1.5">
                <p class="mx-1.5 mb-1 mt-0.5 text-[12px] font-medium text-muted-foreground">근거 RMA 및 조치 내역</p>
                <div
                  v-for="s in m.items"
                  :key="s.rma_id"
                  :class="route.query.open === s.rma_id ? 'bg-brand-soft' : 'hover:bg-muted'"
                  class="rounded-md px-2 py-2"
                >
                  <div class="flex items-center gap-2">
                    <button class="tabular text-[13px] font-bold text-primary underline underline-offset-2" @click="openRma(s.rma_id)">{{ s.rma_id }}</button>
                    <span class="tabular ml-auto text-[12px] text-muted-foreground">{{ s.claim_date }}</span>
                  </div>
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    <span v-for="r in s.reasons" :key="r" class="rounded-[5px] border bg-card px-1.5 py-0.5 text-[11.5px] font-medium text-[#4a505c]">{{ r }}</span>
                  </div>
                  <p class="mt-1.5 text-[12.5px] leading-relaxed text-[#4a505c]">
                    당시 조치: <b class="text-foreground">{{ s.action || '기록 없음' }}</b><template v-if="s.result"> · 결과 {{ s.result }}</template>
                  </p>
                  <p v-if="s.root_cause" class="text-[12.5px] text-[#4a505c]">원인: <b class="text-foreground">{{ s.root_cause }}</b></p>
                </div>
              </div>
              <p v-if="m.view === 'cs' && m.items.length" class="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12px] text-muted-foreground">
                <Lock class="size-3.5" />원인 정보는 품질관리자 권한에서만 내려옵니다.
              </p>
            </template>

            <!-- 분석 결과 (역할별) -->
            <template v-else-if="m.kind === 'analysis'">
              <div class="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                <b>{{ m.rmaId }}</b> {{ m.result.view === 'cs' ? '고객 응대 기준' : '품질 분석 기준' }} 결과입니다. 왼쪽에 상세를 열었습니다.
              </div>
              <dl class="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2.5 text-[12.5px]">
                <dt class="text-muted-foreground">처리 상태</dt><dd class="font-semibold">{{ m.result.status }}</dd>
                <template v-for="[k, v] in m.result.rows" :key="k">
                  <dt class="text-muted-foreground">{{ k }}</dt><dd class="min-w-0 break-words font-semibold">{{ v }}</dd>
                </template>
              </dl>
              <div v-if="m.result.approvals.length" class="rounded-lg border border-[#f6d6bd] bg-sk-orange-soft px-3 py-2 text-[12.5px] text-[#7a3f12]">
                <p class="flex items-center gap-1.5 font-bold"><PauseCircle class="size-3.5" />승인 대기 {{ m.result.approvals.length }}건</p>
                <p class="mt-0.5">{{ m.result.approvals.join(', ') }} · 사람 승인이 필요합니다</p>
              </div>
              <div v-if="m.result.history?.length" class="rounded-lg border px-3 py-2 text-[12.5px]">
                <p class="mb-1 font-medium text-muted-foreground">최근 처리 이력</p>
                <p v-for="h in m.result.history" :key="h" class="truncate">{{ h }}</p>
              </div>
            </template>

            <!-- 접수 후 진행 상태 (서버 응답 기준) -->
            <template v-else-if="m.kind === 'progress'">
              <div class="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                <b>{{ m.rmaId }}</b> 접수를 저장했습니다. 분석 진행 상태입니다.
              </div>
              <ol class="rounded-lg border px-3 py-1">
                <li v-for="s in m.steps" :key="s.label" class="flex gap-2.5 border-b py-2 last:border-b-0">
                  <component :is="stepIcon[s.state]" v-if="stepIcon[s.state]" :class="s.state === 'done' ? 'text-emerald-600' : 'text-sk-orange'" class="mt-0.5 size-4 shrink-0" />
                  <span v-else-if="s.state === 'run'" class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span v-else class="mt-0.5 size-4 shrink-0 rounded-full border-2 border-input" />
                  <span class="min-w-0 text-[13px]">
                    <b class="block font-semibold leading-tight">{{ s.label }}</b>
                    <span class="text-[12px] text-muted-foreground">{{ s.desc }}</span>
                  </span>
                </li>
              </ol>
              <Button variant="ghost" size="xs" @click="refreshProgress(m)"><RefreshCw class="size-3.5" />상태 새로고침</Button>
            </template>
          </div>
        </div>
      </template>
    </div>

    <form :ref="(el) => (cascade[6] = el)" class="flex gap-2 border-t p-3" @submit.prevent="send">
      <input
        ref="inputEl"
        v-model="input"
        :disabled="busy || !aiState.available"
        :placeholder="aiState.available ? '질문을 입력하세요 (Enter 전송)' : 'AI 일시 불가'"
        class="h-9 min-w-0 flex-1 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="icon" :disabled="busy || !input.trim() || !aiState.available" aria-label="전송"><Send class="size-4" /></Button>
    </form>
    </div>
  </aside>
</template>
