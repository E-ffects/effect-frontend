<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { AGENT_STEPS } from '@/lib/caseLabels'
import AgentStepper from './AgentStepper.vue'

// 에이전트 7단계 진행 (AI 명세 trace 순서). Kokonut UI "AI Loading State"(Agent steps, MIT)를 Vue로 옮겼다.
// - 머리줄: 지금 단계 이름 + 경과 시간, 끝나면 "n초 동안 분석 · 7단계". 누르면 목록을 접고 편다
// - 단계: 대기(점) → 진행(회전 + 이름에 밝기 물결) → 완료(체크가 그려짐), 단계 사이 선이 위에서부터 채워진다
// - 단계별 시간: 이 화면에서 지켜본 경우 실제로 걸린 시간, 아니면 trace의 elapsed_ms
// - 완료 단계 아래에는 trace의 실제 작업 기록(action)을 한 줄로
// - 모두 끝나면 목록이 접힌다 (처음부터 끝나 있던 분석은 접힌 채로 시작)
const props = defineProps({ analysis: Object })

const state = computed(() => props.analysis?.analysis_state || 'NOT_REQUESTED')
const trace = computed(() => props.analysis?.trace || [])
const isDone = computed(() => ['SUCCEEDED', 'PARTIAL'].includes(state.value))
const isActive = computed(() => ['QUEUED', 'RUNNING'].includes(state.value))
const doneCount = computed(() => {
  if (isDone.value) return AGENT_STEPS.length
  if (state.value === 'RUNNING' || state.value === 'FAILED') return props.analysis?.progress?.steps_done ?? 0
  return 0
})

const steps = computed(() =>
  AGENT_STEPS.map((s, i) => {
    let status = 'pending'
    if (i < doneCount.value) status = 'done'
    else if (i === doneCount.value && state.value === 'RUNNING') status = 'running'
    else if (i === doneCount.value && state.value === 'FAILED') status = 'error'
    const t = trace.value[i]
    return { id: i, name: s.label, desc: s.desc, label: `${s.label} · ${s.desc}`, status, action: t?.action, traceMs: t?.elapsed_ms }
  }),
)
const running = computed(() => steps.value.find((s) => s.status === 'running'))
const failed = computed(() => steps.value.find((s) => s.status === 'error'))

// 경과 시간: 진행을 처음 본 순간부터. 끝나면 멈춘다
const seconds = ref(0)
let startedAt = null
let tickTimer = null
watch(
  isActive,
  (on) => {
    clearInterval(tickTimer)
    if (!on) return
    startedAt ??= Date.now()
    const tick = () => (seconds.value = Math.floor((Date.now() - startedAt) / 1000))
    tick()
    tickTimer = setInterval(tick, 500)
  },
  { immediate: true },
)

// 단계별 시간: 진행으로 바뀐 순간 ~ 완료로 바뀐 순간
const starts = {}
const times = ref({})
watch(
  steps,
  (list) => {
    const now = Date.now()
    for (const s of list) {
      if (s.status === 'pending') {
        delete starts[s.id]
        continue
      }
      if (s.status === 'running') starts[s.id] ??= now
      if ((s.status === 'done' || s.status === 'error') && starts[s.id] != null && times.value[s.id] == null) {
        times.value = { ...times.value, [s.id]: now - starts[s.id] }
      }
    }
  },
  { immediate: true },
)
const fmtStep = (ms) => (ms < 1000 ? `${ms}ms` : ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`)
// 기록(trace)이 오면 모든 단계를 에이전트가 실제로 쓴 시간으로 통일한다. 진행 중에는 이 화면에서 지켜본 시간
const stepTime = (s) => (s.status === 'done' && s.traceMs != null ? fmtStep(s.traceMs) : times.value[s.id] != null ? fmtStep(times.value[s.id]) : null)
const fmtDuration = (sec) => (sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`)

const title = computed(() => {
  if (failed.value) return `멈춘 단계: ${failed.value.label}`
  if (isDone.value) return seconds.value > 0 ? `${fmtDuration(seconds.value)} 동안 분석` : '분석 완료'
  if (running.value) return running.value.label
  return '분석 준비 중'
})

// 처음부터 끝나 있던 분석은 접힌 채로. 지켜보던 분석은 마지막 체크가 그려진 뒤 접는다
// (화면이 먼저 그려지고 분석 데이터가 늦게 오는 경우도 '처음부터 끝나 있던 분석'으로 본다: 진행을 지켜본 적이 있을 때만 움직인다)
const open = ref(!isDone.value)
const watched = ref(isActive.value)
watch(isActive, (on) => on && (watched.value = true))
let foldTimer = null
watch(isDone, (done) => {
  clearTimeout(foldTimer)
  if (done) {
    if (watched.value) foldTimer = setTimeout(() => (open.value = false), 600)
    else open.value = false
  } else open.value = true
})

onBeforeUnmount(() => {
  clearInterval(tickTimer)
  clearTimeout(foldTimer)
})

const LABEL_CLS = {
  pending: 'text-[#9aa0aa]',
  running: 'text-[#111] font-semibold',
  done: 'text-[#5f6673]',
  error: 'text-destructive font-semibold',
}
</script>

<template>
  <!-- 위: 7개 에이전트 가로 진행 막대(요약, 늘 보임) / 아래: 단계별 작업 기록(끝나면 한 줄로 접힘) -->
  <AgentStepper :steps="steps.map((s) => ({ ...s, time: stepTime(s) }))" :running="isActive" :live="watched" />
  <div class="mt-3 max-w-[640px] border-t border-[#eef0f3] pt-3">
    <button
      type="button"
      class="group flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-semibold text-[#3b404a]"
      :aria-expanded="open"
      aria-controls="agent-steps"
      @click="open = !open"
    >
      <!-- output = 현재 단계를 화면 낭독기가 읽어 준다 -->
      <output class="min-w-0 truncate">{{ title }}</output>
      <span v-if="isActive" class="font-medium text-[#9aa0aa] tabular">{{ fmtDuration(seconds) }}</span>
      <span v-if="isDone" class="font-medium text-[#9aa0aa]">· {{ steps.length }}단계</span>
      <ChevronDown
        aria-hidden="true"
        :class="open ? 'rotate-180' : ''"
        class="ml-auto size-4 text-[#9aa0aa] transition-transform duration-200 ease-[var(--ease-out)] group-hover:text-[#4a505c]"
      />
    </button>

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
            <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-200 ease-[var(--ease-out)]">
              <p v-if="s.status === 'done' && s.action" class="mt-0.5 truncate text-[12px] leading-[18px] text-[#8b919c]" :title="s.action">{{ s.action }}</p>
            </Transition>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
