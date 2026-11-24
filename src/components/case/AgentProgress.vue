<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, RotateCcw } from 'lucide-vue-next'
import { AGENT_STEPS } from '@/lib/caseLabels'
import AgentStepper from './AgentStepper.vue'

// 에이전트 7단계 진행 (AI 명세 trace 순서). Kokonut UI "AI Loading State"(Agent steps, MIT)를 Vue로 옮겼다.
// 화면 진행(shown)은 실제 진행(doneCount)을 한 단계씩 따라간다: 실제 분석이 순식간에 끝나도
// 막대와 기록이 0.86초마다 한 칸씩(7단계 약 6초) 차례로 나온다.
// - 이번 세션에서 처음 보는 분석: 0단계부터 따라간다
// - 이미 본 분석: 바로 완료 상태(기록은 접힌 채). "다시 보기"로 다시 재생
// - 시간 표시: 재생 속도는 보여 주기용. 단계 옆 시간과 합계는 에이전트가 실제로 쓴 시간(trace elapsed_ms)
const props = defineProps({ analysis: Object })

const STEP_MS = 860
const LOG_LAG_MS = 550 // 막대가 먼저 차고, 아래 기록은 한 박자 늦게 내려온다
const N = AGENT_STEPS.length
const SEEN_KEY = 'rma.agentReplayed'
const seenIds = () => new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'))
const markSeen = (id) => {
  const set = seenIds()
  set.add(id)
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-200)))
}

const state = computed(() => props.analysis?.analysis_state || 'NOT_REQUESTED')
const analysisId = computed(() => props.analysis?.analysis_id || null)
const trace = computed(() => props.analysis?.trace || [])
const isDone = computed(() => ['SUCCEEDED', 'PARTIAL'].includes(state.value))
const doneCount = computed(() => {
  if (isDone.value) return N
  if (state.value === 'RUNNING' || state.value === 'FAILED') return props.analysis?.progress?.steps_done ?? 0
  return 0
})

// 화면에 보이는 진행 칸 수: shown = 위 막대, logShown = 아래 기록(한 박자 늦게 따라감)
const shown = ref(0)
const logShown = ref(0)
let logTimers = []
watch(shown, (n) => {
  if (instant.value || n < logShown.value) {
    logTimers.forEach(clearTimeout)
    logTimers = []
    logShown.value = n
    return
  }
  logTimers.push(setTimeout(() => (logShown.value = Math.max(logShown.value, n)), LOG_LAG_MS))
})
const instant = ref(false) // true면 움직임 없이 바로 그린다(이미 본 분석)
const open = ref(true)
let chaseTimer = null
const chasing = computed(() => shown.value < doneCount.value)

function chase() {
  clearTimeout(chaseTimer)
  if (shown.value >= doneCount.value) {
    if (shown.value === N && analysisId.value) markSeen(analysisId.value)
    return
  }
  chaseTimer = setTimeout(() => {
    shown.value += 1
    chase()
  }, STEP_MS)
}

function replay() {
  instant.value = false
  shown.value = 0
  logShown.value = 0
  open.value = true
  chase()
}

// 분석이 바뀌면(새 분석·재분석·데이터 도착) 처음부터 다시 정한다
watch(
  analysisId,
  (id) => {
    clearTimeout(chaseTimer)
    if (id && isDone.value && seenIds().has(id)) {
      instant.value = true
      shown.value = N
      logShown.value = N
      open.value = false
      return
    }
    instant.value = false
    shown.value = 0
    open.value = true
    chase()
  },
  { immediate: true },
)
// 실제 진행이 늘면 따라간다 (줄어들면 = 새 실행, 처음부터)
watch(doneCount, (n) => {
  if (n < shown.value) shown.value = 0
  if (!instant.value) chase()
})
onBeforeUnmount(() => {
  clearTimeout(chaseTimer)
  logTimers.forEach(clearTimeout)
})

const stepsAt = (count) =>
  AGENT_STEPS.map((s, i) => {
    let status = 'pending'
    if (i < count) status = 'done'
    else if (i === count) {
      if (count < doneCount.value || state.value === 'RUNNING') status = 'running'
      else if (state.value === 'FAILED') status = 'error'
    }
    const t = trace.value[i]
    return { id: i, name: s.label, desc: s.desc, label: `${s.label} · ${s.desc}`, status, action: t?.action, traceMs: t?.elapsed_ms }
  })
const barSteps = computed(() => stepsAt(shown.value))
const steps = computed(() => stepsAt(logShown.value)) // 아래 기록과 머리줄은 기록 기준
const running = computed(() => steps.value.find((s) => s.status === 'running'))
const failed = computed(() => steps.value.find((s) => s.status === 'error'))
const finished = computed(() => isDone.value && logShown.value === N)

const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`)
const stepTime = (s) => (s.status === 'done' && s.traceMs != null ? fmtMs(s.traceMs) : null)
const totalMs = computed(() => (trace.value.length ? trace.value.reduce((a, t) => a + (t.elapsed_ms || 0), 0) : null))

const title = computed(() => {
  if (failed.value) return `멈춘 단계: ${failed.value.label}`
  if (finished.value) return '분석 완료'
  if (running.value) return running.value.label
  return '분석 준비 중'
})

const LABEL_CLS = {
  pending: 'text-[#9aa0aa]',
  running: 'text-[#111] font-semibold',
  done: 'text-[#5f6673]',
  error: 'text-destructive font-semibold',
}
</script>

<template>
  <!-- 위: 7개 에이전트 가로 진행 막대(요약, 늘 보임) / 아래: 단계별 작업 기록 -->
  <AgentStepper :steps="barSteps.map((s) => ({ ...s, time: stepTime(s) }))" :running="barSteps.some((s) => s.status === 'running')" :live="!instant" />
  <div class="mt-3 max-w-[640px] border-t border-[#eef0f3] pt-3">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left text-sm font-semibold text-[#3b404a]"
        :aria-expanded="open"
        aria-controls="agent-steps"
        @click="open = !open"
      >
        <!-- output = 현재 단계를 화면 낭독기가 읽어 준다 -->
        <output class="min-w-0 truncate">{{ title }}</output>
        <span v-if="!finished && !failed" class="shrink-0 font-medium text-[#9aa0aa] tabular">{{ Math.min(logShown + 1, N) }}/{{ N }}단계</span>
        <span v-if="finished" class="shrink-0 font-medium text-[#9aa0aa]">· {{ N }}단계<template v-if="totalMs != null"> · 에이전트 처리 {{ fmtMs(totalMs) }}</template></span>
        <ChevronDown
          aria-hidden="true"
          :class="open ? 'rotate-180' : ''"
          class="ml-auto size-4 shrink-0 text-[#9aa0aa] transition-transform duration-200 ease-[var(--ease-out)] group-hover:text-[#4a505c]"
        />
      </button>
      <button
        v-if="finished"
        type="button"
        class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#6b717d] transition-colors hover:bg-muted hover:text-[#111]"
        title="에이전트 진행을 처음부터 다시 봅니다 (실제 처리 시간과 무관한 보기용 재생)"
        @click="replay"
      >
        <RotateCcw class="size-3.5" aria-hidden="true" />다시 보기
      </button>
    </div>

    <div class="fold" :data-open="open">
      <ol id="agent-steps" aria-label="에이전트 진행 단계">
        <li v-for="(s, i) in steps" :key="s.id" class="relative flex gap-3 pt-3">
          <!-- 아이콘 사이 선: 완료되면 위에서부터 채워진다 -->
          <span v-if="i < steps.length - 1" aria-hidden="true" class="absolute bottom-[-10px] left-[7.5px] top-[32px] w-px overflow-hidden bg-[#e6e8ec]">
            <span
              :class="s.status === 'done' ? 'scale-y-100' : 'scale-y-0'"
              class="block h-full w-full origin-top bg-emerald-500/60 transition-transform duration-500 ease-[var(--ease-out)]"
            />
          </span>

          <span class="relative flex size-4 shrink-0 items-center justify-center">
            <Transition
              enter-from-class="opacity-0 blur-[2px]"
              leave-to-class="opacity-0 blur-[2px]"
              enter-active-class="transition-[opacity,filter] duration-[180ms] ease-[var(--ease-out)]"
              leave-active-class="transition-[opacity,filter] duration-[180ms] ease-[var(--ease-out)]"
            >
              <span :key="s.status" class="absolute inset-0 flex items-center justify-center">
                <span v-if="s.status === 'pending'" class="size-1.5 rounded-full bg-[#cfd3da]" />
                <svg v-else-if="s.status === 'running'" aria-hidden="true" class="size-3.5 animate-spin [animation-duration:0.8s]" fill="none" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6.25" stroke="#e6e8ec" stroke-width="1.5" />
                  <path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" stroke="var(--color-primary)" stroke-linecap="round" stroke-width="1.5" />
                </svg>
                <svg v-else-if="s.status === 'done'" aria-hidden="true" class="size-3.5 text-emerald-600" fill="none" viewBox="0 0 16 16">
                  <path class="draw-check" pathLength="1" d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" />
                </svg>
                <svg v-else aria-hidden="true" class="size-3.5 text-destructive" fill="none" viewBox="0 0 16 16">
                  <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" />
                </svg>
              </span>
            </Transition>
          </span>

          <div class="-mt-0.5 min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <p :class="LABEL_CLS[s.status]" class="min-w-0 truncate text-sm transition-colors duration-200">
                <template v-if="s.status === 'running'">
                  <span class="sr-only">{{ s.label }}</span>
                  <span aria-hidden="true"><span v-for="(ch, k) in Array.from(s.label)" :key="k" class="ai-wave whitespace-pre" :style="{ animationDelay: `${k * 0.05}s` }">{{ ch }}</span></span>
                </template>
                <template v-else>{{ s.label }}</template>
              </p>
              <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-200 ease-[var(--ease-out)]">
                <span v-if="stepTime(s)" class="ml-auto shrink-0 text-xs text-[#9aa0aa] tabular">{{ stepTime(s) }}</span>
              </Transition>
            </div>
            <!-- 완료된 단계: trace의 실제 작업 기록 -->
            <!-- 한 박자 늦게, 위에서 살짝 내려오며 -->
            <Transition enter-from-class="opacity-0 -translate-y-2" enter-active-class="transition-[opacity,translate] duration-[280ms] ease-[var(--ease-out)]">
              <p v-if="s.status === 'done' && s.action" class="mt-0.5 truncate text-[12px] leading-[18px] text-[#8b919c]" :title="s.action">{{ s.action }}</p>
            </Transition>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
