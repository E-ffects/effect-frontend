<script setup>
import { computed, ref, useId } from 'vue'
import { useWidth } from './useWidth'
import { CHART } from '@/lib/chart'

// 주차별 추이 (v4): SK Red 선 + 아래로 옅어지는 면, 흰 점, 점선 격자. 대책 완료일은 SK Orange 점선. 지점 클릭.
const props = defineProps({
  points: { type: Array, default: () => [] }, // [{ from, to, label, count }]
  markers: { type: Array, default: () => [] }, // [{ date, label }]
  yLabel: { type: String, default: '발생 건수(건)' },
  height: { type: Number, default: 220 },
})
defineEmits(['select'])

const gid = `trend-fill-${useId()}`
const root = ref(null)
const W = useWidth(root)
// 위쪽 여백(t)은 '대책 완료' 글자 자리: 그래프 선·점은 이 아래에만 그려져 글자를 가리지 않는다
const pad = { l: 36, r: 16, t: 26, b: 30 }
const hover = ref(null)

const yMax = computed(() => {
  const m = Math.max(3, ...props.points.map((p) => p.count))
  return Math.ceil(m * 1.05)
})
const yTicks = computed(() => {
  const n = Math.min(3, yMax.value) // v4: 0 · 1/3 · 2/3 · 최대
  return Array.from({ length: n + 1 }, (_, i) => Math.round((yMax.value / n) * i))
})
const innerW = computed(() => W.value - pad.l - pad.r)
const innerH = computed(() => props.height - pad.t - pad.b)
const n = computed(() => props.points.length)
const x = (i) => pad.l + (n.value <= 1 ? innerW.value / 2 : (innerW.value * i) / (n.value - 1))
const y = (v) => pad.t + innerH.value - (v / yMax.value) * innerH.value
const path = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.count)}`).join(' '))
const area = computed(() => (n.value ? `${path.value} L${x(n.value - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''))
const labelEvery = computed(() => Math.max(1, Math.ceil(n.value / Math.max(1, Math.floor(innerW.value / 56)))))
const empty = computed(() => n.value > 0 && props.points.every((p) => !p.count))
const dateLabel = (p) => p.from.slice(5).replace('-', '.') // 10-05 → 10.05

// 대책 완료 표시: 위치를 계산하고, 글자끼리 겹치면 앞의 것만 글자를 남긴다 (점선은 모두 그림)
const markerItems = computed(() => {
  const items = props.markers
    .map((m) => ({ ...m, x: markerX(m) }))
    .filter((m) => m.x != null)
    .sort((a, b) => a.x - b.x)
  const LABEL_W = 52
  let lastEnd = -Infinity
  for (const m of items) {
    m.anchorEnd = m.x + 4 + LABEL_W > W.value - 2 // 오른쪽 끝에 붙으면 글자를 점선 왼쪽에
    const start = m.anchorEnd ? m.x - 4 - LABEL_W : m.x + 4
    m.showLabel = start >= lastEnd + 6
    if (m.showLabel) lastEnd = start + LABEL_W
  }
  return items
})

// 그래프 아래 안내: 대책 완료일 한 줄 (첫 사례 + 외 N건, 전체 목록은 마우스를 올리면)
const markerSummary = computed(() => {
  const list = [...props.markers].sort((a, b) => a.date.localeCompare(b.date))
  if (!list.length) return null
  const first = list[0]
  return {
    text: `${first.label} (${first.date})` + (list.length > 1 ? ` 외 ${list.length - 1}건` : ''),
    full: list.map((m) => `${m.date}  ${m.label}`).join('\n'),
  }
})

function markerX(m) {
  const t = new Date(m.date).getTime()
  const i = props.points.findIndex((p) => new Date(p.from).getTime() <= t && t <= new Date(p.to).getTime())
  if (i < 0) return null
  const p = props.points[i]
  const frac = (t - new Date(p.from)) / (new Date(p.to) - new Date(p.from) + 86400000)
  const next = i < n.value - 1 ? x(i + 1) : x(i)
  return x(i) + (next - x(i)) * frac
}
</script>

<template>
  <div ref="root" class="relative w-full">
    <svg v-if="W > 0" :width="W" :height="height" class="block" role="img" :aria-label="`${yLabel} 주차별 추이`">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop :stop-color="CHART.red" stop-opacity="0.12" />
          <stop offset="1" :stop-color="CHART.red" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g v-for="t in yTicks" :key="t">
        <line :x1="pad.l" :x2="W - pad.r" :y1="y(t)" :y2="y(t)" :stroke="CHART.grid" :stroke-dasharray="t ? '3 4' : null" />
        <text :x="pad.l - 10" :y="y(t) + 3.5" text-anchor="end" font-size="12" :fill="CHART.label">{{ t }}</text>
      </g>
      <path :d="area" :fill="`url(#${gid})`" />
      <path :d="path" fill="none" :stroke="CHART.red" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <g v-for="m in markerItems" :key="m.date + m.label">
        <line :x1="m.x" :x2="m.x" :y1="pad.t - 8" :y2="y(0)" :stroke="CHART.orange" stroke-width="1.5" stroke-dasharray="4 4" />
        <text
          v-if="m.showLabel" :x="m.anchorEnd ? m.x - 4 : m.x + 4" :y="pad.t - 10"
          :text-anchor="m.anchorEnd ? 'end' : 'start'" font-size="12" font-weight="600" :fill="CHART.orangeText"
        >대책 완료</text>
      </g>
      <g v-for="(p, i) in points" :key="p.from">
        <text v-if="i % labelEvery === 0" :x="x(i)" :y="height - 9" text-anchor="middle" font-size="12" :fill="CHART.label">{{ dateLabel(p) }}</text>
        <circle
          :cx="x(i)" :cy="y(p.count)" :r="hover === i ? 6 : 3"
          :fill="hover === i ? CHART.red : '#fff'" :stroke="CHART.red" stroke-width="1.7"
          class="transition-[r] duration-150"
        />
        <rect
          :x="x(i) - innerW / Math.max(1, n) / 2" :y="pad.t" :width="innerW / Math.max(1, n)" :height="innerH" fill="transparent"
          class="cursor-pointer outline-none" tabindex="0" role="button" :aria-label="`${p.from} 주 ${p.count}건, 목록 보기`"
          @mouseenter="hover = i" @mouseleave="hover = null" @focus="hover = i" @blur="hover = null"
          @click="$emit('select', p)" @keydown.enter="$emit('select', p)"
        />
      </g>
      <text v-if="empty" :x="W / 2" :y="pad.t + innerH / 2" text-anchor="middle" font-size="13" fill="#9da4ae">선택 조건에 발생 사례가 없습니다</text>
    </svg>
    <div
      v-if="hover != null"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#242a35] px-2.5 py-1.5 text-[12px] text-white shadow-[0_6px_18px_#242a3530]"
      :style="{ left: x(hover) + 'px', top: y(points[hover].count) - 12 + 'px' }"
    >
      {{ points[hover].from }} ~ {{ points[hover].to }}, <b>{{ points[hover].count }}건</b>, 클릭해 사례 조회
    </div>
    <p v-if="markerSummary" class="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-chart-label" :title="markerSummary.full">
      <span class="inline-block h-3 shrink-0 border-l-[1.5px] border-dashed border-sk-orange" />
      <span class="shrink-0">대책 완료일:</span>
      <span class="truncate">{{ markerSummary.text }}</span>
    </p>
  </div>
</template>
