<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { S, animate, clamp, settled, snap, step, stop } from '@/lib/spring'

// 에이전트 7단계 가로 진행 막대. DesignBookmark "Step Progress"(step-progress/steps.js)의 스프링을 그대로 쓴다:
// - 초록 막대 길이가 지금 단계까지 늘어난다 (160 22)
// - 끝난 칸은 초록으로 차고(260 24) 0.12초 뒤 체크가 그려진다(140 20)
// - 지금 칸은 검정으로 차오르고(300 26) 튀어 오른다(500 14, 0.7배에서 시작)
// 우리 쪽 추가: 진행 중인 칸 둘레에 회전 테두리, 칸 아래 에이전트 이름·하는 일·걸린 시간
const props = defineProps({
  steps: { type: Array, required: true }, // [{ id, name, desc, status: pending|running|done|error, time }]
  running: Boolean,
  live: Boolean, // 이 화면에서 진행을 지켜봤는지. 아니면(끝난 분석을 연 경우) 움직이지 않고 바로 그린다
})

const N = computed(() => props.steps.length)
const cur = computed(() => {
  const i = props.steps.findIndex((s) => s.status !== 'done')
  return i < 0 ? N.value - 1 : i
})
const allDone = computed(() => props.steps.every((s) => s.status === 'done'))

const bar = ref()
const dots = []
const nums = []
const paths = []
const L = S(0, 160, 22)
const sp = props.steps.map(() => ({ f: S(0, 260, 24), c: S(0, 140, 20), p: S(1, 500, 14), on: S(0, 300, 26) }))
let timers = []

const comp = {
  frame(dt) {
    step(L, dt)
    sp.forEach((s) => {
      step(s.f, dt)
      step(s.c, dt)
      step(s.p, dt)
      step(s.on, dt)
    })
  },
  render() {
    if (!bar.value) return
    bar.value.style.width = `${(clamp(L.x, 0, 1) * 100).toFixed(3)}%`
    sp.forEach((s, k) => {
      const d = dots[k]
      if (!d) return
      const f = clamp(s.f.x, 0, 1)
      const o = clamp(s.on.x, 0, 1)
      d.style.background =
        f > 0.01
          ? `color-mix(in srgb, #1f9d6b ${(f * 100).toFixed(1)}%, #eff1f4)`
          : o > 0.01
            ? `color-mix(in srgb, #111 ${(o * 100).toFixed(1)}%, #eff1f4)`
            : ''
      d.style.color = o > 0.5 || f > 0.5 ? '#fff' : ''
      nums[k].style.opacity = (1 - f).toFixed(3)
      paths[k].style.strokeDashoffset = (22 * (1 - clamp(s.c.x, 0, 1))).toFixed(2)
      d.style.transform = `scale(${s.p.x.toFixed(4)})`
    })
  },
  idle: () => settled(L) && sp.every((s) => settled(s.f) && settled(s.c) && settled(s.p) && settled(s.on)),
}

// jump: 처음 그릴 때는 지금 상태로 바로 (움직임 없이)
function go({ jump = false } = {}) {
  const i = cur.value
  L.t = allDone.value ? 1 : i / (N.value - 1)
  props.steps.forEach((st, k) => {
    const s = sp[k]
    const done = st.status === 'done'
    s.f.t = done ? 1 : 0
    s.on.t = k === i && !done && st.status !== 'pending' ? 1 : 0
    if (done) {
      if (jump) s.c.t = 1
      else if (s.c.t !== 1) timers.push(setTimeout(() => ((s.c.t = 1), animate(comp)), 120))
    } else s.c.t = 0
  })
  if (jump) {
    ;[L, ...sp.flatMap((s) => [s.f, s.c, s.p, s.on])].forEach(snap)
    comp.render()
    return
  }
  animate(comp)
}

let last = -1
watch(
  () => props.steps.map((s) => s.status).join(),
  () => {
    const i = cur.value
    if (i !== last && last !== -1 && !allDone.value) {
      // 새 단계가 시작되면 그 칸이 튀어 오른다
      sp[i].p.x = 0.7
      sp[i].p.v = 6
    }
    last = i
    go({ jump: !props.live })
  },
)

onMounted(async () => {
  await nextTick()
  last = cur.value
  go({ jump: true })
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  stop(comp)
})

const pos = (k) => `${(k / (N.value - 1)) * 100}%`
</script>

<template>
  <div class="px-10 pb-1 pt-2">
    <!-- 막대와 칸 -->
    <div class="relative h-8">
      <span class="absolute inset-x-0 top-[14px] h-1 rounded-full bg-[#e6e8ec]" />
      <span ref="bar" class="absolute left-0 top-[14px] h-1 rounded-full bg-[#1f9d6b] will-change-[width]" />
      <span
        v-for="(s, k) in steps"
        :key="s.id"
        :ref="(el) => (dots[k] = el)"
        :style="{ left: pos(k) }"
        class="absolute top-0 -ml-4 grid size-8 place-items-center rounded-full bg-[#eff1f4] text-[13px] font-bold text-[#8b919c] will-change-transform"
      >
        <b :ref="(el) => (nums[k] = el)" class="absolute tabular">{{ k + 1 }}</b>
        <svg viewBox="0 0 24 24" class="absolute size-4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :ref="(el) => (paths[k] = el)" d="M5 12.5l4.5 4.5L19 7.5" style="stroke-dasharray: 22; stroke-dashoffset: 22" />
        </svg>
        <!-- 진행 중인 칸: 둘레를 도는 빨간 테두리 -->
        <svg v-if="running && k === cur && s.status === 'running'" viewBox="0 0 40 40" class="pointer-events-none absolute -inset-1 size-10 animate-spin [animation-duration:1.1s]" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="18" stroke="var(--color-primary)" stroke-opacity="0.15" stroke-width="2" />
          <path d="M20 2a18 18 0 0 1 18 18" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" />
        </svg>
      </span>
    </div>
    <!-- 이름 · 하는 일 · 걸린 시간 -->
    <div class="relative mt-2.5 h-[52px]">
      <div
        v-for="(s, k) in steps"
        :key="s.id"
        :style="{ left: pos(k) }"
        class="absolute top-0 w-[120px] -translate-x-1/2 text-center"
      >
        <p :class="s.status === 'pending' ? 'text-[#9aa0aa]' : 'text-[#111]'" class="truncate text-[13px] font-bold transition-colors duration-300">{{ s.name }}</p>
        <p class="truncate text-[12px] text-[#8b919c]">{{ s.desc }}</p>
        <p class="h-4 text-[11px] text-[#9aa0aa] tabular">
          <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-200 ease-[var(--ease-out)]">
            <span v-if="s.time">{{ s.time }}</span>
          </Transition>
        </p>
      </div>
    </div>
  </div>
</template>
