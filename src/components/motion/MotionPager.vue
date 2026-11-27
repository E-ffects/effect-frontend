<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * DesignBookmark "Pagination Dots" (Vue 3 port).
 * Exact springs from dots.js:
 *  - strip slide P: k=170, c=22
 *  - active pill edges A & B: leading edge k=520, c=34; trailing edge k=140, c=18
 *  - supports touch swipe + dot clicks
 */
const props = defineProps({
  count: { type: Number, required: true },
  modelValue: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue'])

const stripEl = ref(null)
const actEl = ref(null)
const dotEls = ref([])

const reduce =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const S = (x, k = 400, c = 30) => ({
  x,
  v: 0,
  t: x,
  k,
  c: reduce ? 2 * Math.sqrt(k) : c,
})
const tune = (s, k, c) => {
  s.k = k
  s.c = reduce ? 2 * Math.sqrt(k) : c
}
const step = (s, dt) => {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

const P = S(props.modelValue, 170, 22)
const A = S(0, 520, 34)
const B = S(0, 140, 18)

let cur = props.modelValue
let ready = false

function go(i, immediate = false) {
  if (props.count <= 0) return
  const clamped = Math.max(0, Math.min(props.count - 1, i))
  const dir = clamped >= cur ? 1 : -1
  cur = clamped
  emit('update:modelValue', clamped)

  P.t = clamped
  const btn = dotEls.value[clamped]
  if (btn) {
    const w = 22
    const c = btn.offsetLeft + btn.offsetWidth / 2
    A.t = c - w / 2
    B.t = c + w / 2
    if (dir > 0) {
      tune(B, 520, 34)
      tune(A, 140, 18)
    } else {
      tune(A, 520, 34)
      tune(B, 140, 18)
    }
    if (immediate) {
      P.x = P.t
      A.x = A.t
      B.x = B.t
    }
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v !== cur) go(v)
  },
)

watch(
  () => props.count,
  () => nextTick(() => go(Math.min(cur, Math.max(0, props.count - 1)), true)),
)

// Touch swipe support for mobile
let touchStartX = 0
let touchStartY = 0
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
    go(cur + (dx < 0 ? 1 : -1))
  }
}

let rafId = 0
let last = 0

function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30)
  last = now

  if (!ready && dotEls.value[0]?.offsetWidth) {
    go(cur, true)
    ready = true
  }

  const sub = 4
  for (let k = 0; k < sub; k++) {
    step(P, dt / sub)
    step(A, dt / sub)
    step(B, dt / sub)
  }

  if (stripEl.value) {
    stripEl.value.style.transform = `translateX(${(-P.x * 100).toFixed(3)}%)`
  }
  if (actEl.value) {
    actEl.value.style.transform = `translateX(${A.x.toFixed(2)}px)`
    actEl.value.style.width = `${Math.max(8, B.x - A.x).toFixed(2)}px`
  }

  rafId = requestAnimationFrame(loop)
}

onMounted(() => {
  last = performance.now()
  rafId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => cancelAnimationFrame(rafId))

function setDotRef(el, idx) {
  if (el) dotEls.value[idx] = el
}
</script>

<template>
  <div class="w-full" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <div class="overflow-hidden rounded-[24px]">
      <div ref="stripEl" class="flex will-change-transform">
        <slot />
      </div>
    </div>

    <div v-if="count > 1" class="relative mt-3.5 flex h-5 items-center justify-center gap-[14px]" role="tablist" aria-label="브리핑 카드 페이지">
      <span
        ref="actEl"
        class="pointer-events-none absolute left-0 top-[6px] h-[8px] rounded-[4px] bg-white will-change-transform"
      />
      <button
        v-for="i in count"
        :key="i"
        :ref="(el) => setDotRef(el, i - 1)"
        type="button"
        class="size-[8px] rounded-full bg-white/20 p-0 transition hover:bg-white/40"
        :aria-label="`슬라이드 ${i}`"
        :aria-selected="cur === i - 1"
        @click="go(i - 1)"
      />
    </div>
  </div>
</template>
