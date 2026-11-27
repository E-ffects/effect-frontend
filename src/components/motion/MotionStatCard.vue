<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * DesignBookmark "Stat Card" (Vue 3 port).
 * Exact springs from stat.js:
 *  - 12 chart points: k=200, c=17 (staggered k * 0.03s)
 *  - big value & delta: k=160, c=22
 *  - segmented pill (px, pw): k=380, c=30
 */
const props = defineProps({
  label: { type: String, default: 'RMA 발생 추이' },
  unit: { type: String, default: '건' },
  accent: { type: String, default: '#34d17a' }, // green / cyan / violet
  // [{ key, label, value, delta, pts: number[12] (0..1) }]
  ranges: { type: Array, required: true },
  initialIndex: { type: Number, default: 1 },
})

const emit = defineEmits(['change'])

const chartEl = ref(null)
const lineEl = ref(null)
const fillEl = ref(null)
const dotEl = ref(null)
const bigEl = ref(null)
const deltaEl = ref(null)
const pillEl = ref(null)
const btnEls = ref([])
const activeIdx = ref(props.initialIndex)

const gradId = `stat-area-${Math.random().toString(36).slice(2, 8)}`

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
const step = (s, dt) => {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const N_PTS = 12
const pts = Array.from({ length: N_PTS }, () => S(0.2, 200, 17))
const val = S(0, 160, 22)
const dv = S(0, 160, 22)
const px = S(0, 380, 30)
const pw = S(0, 380, 30)

const timers = []
const after = (sec, fn) => {
  const t = { t: sec, fn }
  timers.push(t)
  return t
}

function normalizePts(raw) {
  if (!raw?.length) return Array(N_PTS).fill(0.2)
  if (raw.length === N_PTS) return raw
  // Resample to 12 points smoothly
  return Array.from({ length: N_PTS }, (_, i) => {
    const pos = (i / (N_PTS - 1)) * (raw.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(raw.length - 1, Math.ceil(pos))
    const f = pos - lo
    return raw[lo] * (1 - f) + raw[hi] * f
  })
}

function pick(i) {
  const r = props.ranges[i]
  if (!r) return
  activeIdx.value = i
  timers.length = 0

  const btn = btnEls.value[i]
  if (btn) {
    px.t = btn.offsetLeft
    pw.t = btn.offsetWidth
    if (!pw.x) {
      px.x = px.t
      pw.x = pw.t
    }
  }

  val.t = Number(r.value) || 0
  dv.t = Number(r.delta) || 0

  const targetPts = normalizePts(r.pts)
  pts.forEach((p, k) => {
    after(k * 0.03, () => {
      if (activeIdx.value === i) p.t = targetPts[k]
    })
  })
  emit('change', i)
}

watch(
  () => props.ranges,
  () => {
    pick(Math.min(activeIdx.value, Math.max(0, props.ranges.length - 1)))
  },
  { deep: true },
)

let rafId = 0
let last = 0

function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30)
  last = now

  for (let i = timers.length - 1; i >= 0; i--) {
    if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn()
  }

  const sub = 4
  for (let s = 0; s < sub; s++) {
    for (let j = 0; j < pts.length; j++) step(pts[j], dt / sub)
    step(val, dt / sub)
    step(dv, dt / sub)
    step(px, dt / sub)
    step(pw, dt / sub)
  }

  if (chartEl.value && lineEl.value && fillEl.value && dotEl.value) {
    const W = chartEl.value.clientWidth || 280
    const H = 96
    const n = pts.length
    chartEl.value.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const xy = pts.map((p, i) => [
      4 + (i / (n - 1)) * (W - 8),
      8 + (1 - clamp(p.x, -0.05, 1.05)) * (H - 16),
    ])
    let d = `M${xy[0][0].toFixed(2)} ${xy[0][1].toFixed(2)}`
    for (let i = 0; i < n - 1; i++) {
      const p0 = xy[i - 1] || xy[i]
      const p1 = xy[i]
      const p2 = xy[i + 1]
      const p3 = xy[i + 2] || p2
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
    }
    lineEl.value.setAttribute('d', d)
    fillEl.value.setAttribute('d', `${d} L${xy[n - 1][0].toFixed(2)} ${H} L${xy[0][0].toFixed(2)} ${H} Z`)
    const [lx, ly] = xy[n - 1]
    dotEl.value.style.transform = `translate(${(lx - 4.5).toFixed(2)}px,${(ly - 4.5).toFixed(2)}px)`
  }

  if (bigEl.value) {
    const num = Math.max(0, val.x)
    const fmt = num >= 100 || Number.isInteger(props.ranges[activeIdx.value]?.value)
      ? Math.round(num).toLocaleString()
      : num.toFixed(1)
    bigEl.value.textContent = `${fmt}${props.unit}`
  }
  if (deltaEl.value) {
    const dNum = dv.x
    const sign = dNum >= 0 ? '+' : ''
    deltaEl.value.textContent = `${sign}${dNum.toFixed(1)}%`
  }
  if (pillEl.value) {
    pillEl.value.style.transform = `translateX(${px.x.toFixed(2)}px)`
    pillEl.value.style.width = `${pw.x.toFixed(2)}px`
  }

  rafId = requestAnimationFrame(loop)
}

onMounted(() => {
  last = performance.now()
  requestAnimationFrame(() => {
    pick(Math.min(props.initialIndex, Math.max(0, props.ranges.length - 1)))
    rafId = requestAnimationFrame(loop)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  timers.length = 0
})

function setBtnRef(el, idx) {
  if (el) btnEls.value[idx] = el
}
</script>

<template>
  <div class="rounded-[24px] border border-white/12 bg-[#0b0f1f]/82 p-[18px] shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-[12.5px] leading-[18px] text-[#b9becf]">{{ label }}</p>
        <p ref="bigEl" class="mt-0.5 text-[32px] font-semibold leading-[38px] tracking-[-0.02em] text-white tabular-nums">
          0{{ unit }}
        </p>
      </div>
      <span
        ref="deltaEl"
        class="rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums"
        :style="{ background: `${accent}24`, color: accent }"
      >
        +0.0%
      </span>
    </div>

    <div class="relative my-3.5">
      <svg ref="chartEl" class="block h-[96px] w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="accent" stop-opacity="0.34" />
            <stop offset="1" :stop-color="accent" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path ref="fillEl" :fill="`url(#${gradId})`" />
        <path
          ref="lineEl"
          fill="none"
          :stroke="accent"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span
        ref="dotEl"
        class="pointer-events-none absolute left-0 top-0 size-[9px] rounded-full will-change-transform"
        :style="{ background: accent, boxShadow: `0 0 12px ${accent}` }"
      />
    </div>

    <div class="relative flex rounded-full bg-white/[0.06] p-[3px]">
      <span
        ref="pillEl"
        class="pointer-events-none absolute bottom-[3px] left-0 top-[3px] rounded-full bg-white/[0.15] will-change-transform"
      />
      <button
        v-for="(r, idx) in ranges"
        :key="r.key || idx"
        :ref="(el) => setBtnRef(el, idx)"
        type="button"
        class="relative z-10 flex-1 py-1.5 text-[12.5px] font-medium transition-colors"
        :class="activeIdx === idx ? 'text-white' : 'text-[#b9becf]/75 hover:text-white'"
        @click="pick(idx)"
      >
        {{ r.label }}
      </button>
    </div>
  </div>
</template>
