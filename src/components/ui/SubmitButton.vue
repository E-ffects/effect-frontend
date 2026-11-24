<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { S, animate, clamp, settled, step, stop } from '@/lib/spring'

// 실행 버튼: 누르면 글자가 내려가며 버튼이 원으로 접히고 회전 표시가 돈다.
// 끝나면 원이 초록 알약으로 펴지며 체크가 그려지고 완료 문구가 올라온다. 잠시 뒤 원래 버튼으로.
// DesignBookmark "Loading > Success"(loading-success/submit.js)의 스프링 값을 그대로 쓴다.
// - action: 실제 작업. true(또는 값)면 성공, false면 실패(오류 안내는 action 쪽에서 한다)
// - check: 시작 전에 막을 조건(입력 확인 등). false면 움직이지 않는다
// - done 이벤트: 완료 모습을 보여 준 뒤 발생 (화면 이동·새로고침은 여기서)
const props = defineProps({
  action: { type: Function, required: true },
  check: Function,
  successLabel: { type: String, default: '완료' },
  block: Boolean,
  size: { type: String, default: 'default' }, // default 36px · sm 32px · lg 44px
  disabled: Boolean,
})
const emit = defineEmits(['done'])

const HEIGHT = { sm: 32, default: 36, lg: 44 }
const SIZE_CLS = { sm: 'h-8 px-3 text-xs', default: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-[15px]' }
const MIN_LOADING_S = 0.7 // 원으로 접히는 모습이 보이도록 최소한 이만큼은 돈다
const SHOW_DONE_S = 1.1 // 완료 모습을 보여 주는 시간
const LEN = 22 // 체크 path 길이

const wrap = ref()
const btn = ref()
const txt = ref()
const spin = ref()
const doneEl = ref()
const tick = ref()
const ghostIdle = ref()
const ghostDone = ref()
const state = ref('idle') // idle · load · done

const W = S(0, 300, 22) // 버튼 너비
const T = S(1, 400, 30) // 원래 글자
const P = S(0, 300, 28) // 회전 표시
const D = S(0, 220, 20) // 완료 문구
const G = S(0, 200, 30) // 초록으로 물들기
const K = S(0, 120, 20) // 체크 그리기
const all = [W, T, P, D, G, K]
let rot = 0
let timers = []
const later = (s, fn) => timers.push(setTimeout(fn, s * 1000))

const h = () => HEIGHT[props.size] || 36
const idleWidth = () => (props.block ? wrap.value.clientWidth : ghostIdle.value.offsetWidth)
const doneWidth = () => Math.min(ghostDone.value.offsetWidth, props.block ? wrap.value.clientWidth : Infinity)

const comp = {
  frame(dt) {
    rot += dt * 360 * 1.4
    all.forEach((s) => step(s, dt))
  },
  render() {
    const b = btn.value
    if (!b) return
    const resting = state.value === 'idle' && all.every(settled)
    b.style.width = resting ? '' : `${W.x.toFixed(2)}px`
    const round = clamp(Math.max(P.x, D.x * 0.6), 0, 1)
    b.style.borderRadius = `${(10 + (h() / 2 - 10) * round).toFixed(2)}px`
    const g = clamp(G.x, 0, 1)
    b.style.background = g > 0.01 ? `color-mix(in srgb, #1f9d6b ${(g * 100).toFixed(1)}%, var(--color-primary))` : ''
    txt.value.style.opacity = clamp(T.x, 0, 1).toFixed(3)
    txt.value.style.transform = `translateY(${((1 - T.x) * 14).toFixed(2)}px)`
    spin.value.style.opacity = clamp(P.x, 0, 1).toFixed(3)
    spin.value.style.transform = `rotate(${rot % 360}deg) scale(${(0.6 + 0.4 * clamp(P.x, 0, 1.2)).toFixed(3)})`
    doneEl.value.style.opacity = clamp(D.x, 0, 1).toFixed(3)
    doneEl.value.style.transform = `translateY(${((1 - D.x) * 12).toFixed(2)}px)`
    tick.value.style.strokeDashoffset = (LEN * (1 - clamp(K.x, 0, 1))).toFixed(2)
  },
  idle: () => state.value !== 'load' && all.every(settled),
}

function backToIdle() {
  state.value = 'idle'
  D.t = 0
  G.t = 0
  K.t = 0
  P.t = 0
  W.t = idleWidth()
  later(0.12, () => (T.t = 1))
  animate(comp)
}

async function run() {
  if (state.value !== 'idle' || props.disabled) return
  if (props.check && props.check() === false) return
  W.x = W.t = btn.value.offsetWidth
  state.value = 'load'
  T.t = 0
  W.t = h()
  P.t = 1
  animate(comp)
  const started = performance.now()
  let ok = false
  try {
    ok = (await props.action()) !== false
  } catch {
    ok = false
  }
  const wait = Math.max(0, MIN_LOADING_S - (performance.now() - started) / 1000)
  later(wait, () => {
    if (!ok) return backToIdle()
    state.value = 'done'
    P.t = 0
    W.t = doneWidth()
    G.t = 1
    D.t = 1
    later(0.15, () => (K.t = 1))
    animate(comp)
    later(SHOW_DONE_S, () => {
      emit('done')
      // 화면이 그대로 남아 있으면(이동하지 않으면) 원래 버튼으로 돌아온다
      later(0.9, () => btn.value && backToIdle())
    })
  })
}

defineExpose({ run })

onMounted(() => {
  tick.value.style.strokeDasharray = LEN
  comp.render()
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  stop(comp)
})
</script>

<template>
  <span ref="wrap" :class="block ? 'flex w-full justify-center' : 'inline-flex'" class="relative">
    <button
      ref="btn"
      type="button"
      :disabled="disabled || state !== 'idle'"
      :aria-busy="state === 'load'"
      :aria-label="state === 'done' ? successLabel : undefined"
      :class="[SIZE_CLS[size], block ? 'w-full' : '']"
      class="relative inline-flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-[10px] bg-primary font-semibold text-primary-foreground shadow-xs transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100 disabled:hover:brightness-100"
      :style="disabled && state === 'idle' ? { opacity: 0.5 } : null"
      @click="run"
    >
      <span ref="txt" class="inline-flex items-center gap-1.5"><slot /></span>
      <span ref="spin" aria-hidden="true" class="pointer-events-none absolute inset-0 m-auto size-[18px] opacity-0">
        <svg viewBox="0 0 24 24" fill="none" class="size-full">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.3" stroke-width="2.5" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </span>
      <span ref="doneEl" aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 opacity-0">
        <svg viewBox="0 0 24 24" fill="none" class="size-4">
          <path ref="tick" d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ successLabel }}
      </span>
    </button>
    <!-- 너비 재기용 (보이지 않음) -->
    <span aria-hidden="true" class="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap">
      <span ref="ghostIdle" :class="SIZE_CLS[size]" class="inline-flex items-center gap-1.5 font-semibold"><slot /></span>
      <span ref="ghostDone" :class="SIZE_CLS[size]" class="inline-flex items-center gap-1.5 font-semibold"><span class="size-4" />{{ successLabel }}</span>
    </span>
  </span>
</template>
