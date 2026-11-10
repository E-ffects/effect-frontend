<script setup>
import { computed, ref } from 'vue'
import { useWidth } from './useWidth'
import { CHART } from '@/lib/chart'

// 대책 전후 주간 발생: 대책 전 회색 막대, 대책 후 SK Orange 막대(옅은 주황 배경), 재발 의심 주차는 SK Red.
// "대책 완료" 표시는 그래프 위 여백(배지)에만 그려 막대·선과 겹치지 않는다. 구간 평균은 점선, 값은 범례에.
const props = defineProps({
  points: { type: Array, default: () => [] }, // [{ label, count, after, recurrence }]
  completed: String,
  beforeAvg: Number,
  afterAvg: Number,
  height: { type: Number, default: 250 },
})

const root = ref(null)
const W = useWidth(root)
const BADGE_H = 22 // 위 여백: 대책 완료 배지
const pad = { l: 36, r: 16, t: BADGE_H + 18, b: 28 }
const n = computed(() => props.points.length)
const innerW = computed(() => W.value - pad.l - pad.r)
const innerH = computed(() => props.height - pad.t - pad.b)

// 정수 눈금 (1·2·5 × 10^n 간격), 맨 위 막대의 값 라벨 자리를 남긴다
const scale = computed(() => {
  const max = Math.max(1, ...props.points.map((p) => p.count), props.beforeAvg || 0, props.afterAvg || 0)
  const raw = Math.max(1, (max * 1.2) / 4)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 5, 10].find((m) => m * mag >= raw) * mag)
  const top = Math.ceil((max * 1.2) / step) * step
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) }
})
const slot = computed(() => innerW.value / Math.max(1, n.value))
const barW = computed(() => Math.max(4, Math.min(30, slot.value * 0.58)))
const bx = (i) => pad.l + slot.value * i
const y = (v) => pad.t + innerH.value - (v / scale.value.top) * innerH.value
const split = computed(() => props.points.findIndex((p) => p.after))
const splitX = computed(() => bx(split.value))
const fill = (p) => (p.recurrence ? CHART.red : p.after ? CHART.orange : CHART.before)
const showValue = computed(() => slot.value >= 18)
const labelEvery = computed(() => Math.max(1, Math.ceil(n.value / 12)))

// 대책 완료 배지: 기본은 선 오른쪽, 오른쪽 끝에 걸리면 선 왼쪽
const badgeText = computed(() => `대책 완료 ${props.completed || ''}`.trim())
const badgeW = computed(() => badgeText.value.length * 7.2 + 18)
const badgeLeft = computed(() => splitX.value + badgeW.value > W.value - pad.r)
const badgeX = computed(() => (badgeLeft.value ? splitX.value - badgeW.value : splitX.value))
</script>

<template>
  <div ref="root" class="w-full">
    <svg v-if="W > 0" :width="W" :height="height" class="block" role="img" aria-label="대책 전후 주간 발생 추이">
      <!-- 대책 후 구간 배경 + 구간 이름 -->
      <template v-if="split >= 0">
        <rect :x="splitX" :y="pad.t" :width="W - pad.r - splitX" :height="innerH" :fill="CHART.afterBg" />
        <text :x="splitX - 8" :y="pad.t + 14" text-anchor="end" font-size="11" font-weight="600" :fill="CHART.label">대책 전</text>
        <text :x="splitX + 8" :y="pad.t + 14" font-size="11" font-weight="600" :fill="CHART.orangeText">대책 후</text>
      </template>

      <!-- y축 눈금 -->
      <g v-for="t in scale.ticks" :key="t">
        <line :x1="pad.l" :x2="W - pad.r" :y1="y(t)" :y2="y(t)" :stroke="t === 0 ? '#d5d9df' : CHART.grid" />
        <text :x="pad.l - 8" :y="y(t) + 4" text-anchor="end" font-size="11" :fill="CHART.label">{{ t }}</text>
      </g>

      <!-- 막대 · 값 · x축 -->
      <g v-for="(p, i) in points" :key="i">
        <rect :x="bx(i) + (slot - barW) / 2" :y="y(p.count)" :width="barW" :height="Math.max(0, y(0) - y(p.count))" rx="3" :fill="fill(p)">
          <title>{{ p.label }} 주, {{ p.count }}건{{ p.recurrence ? ', 재발 의심' : '' }}</title>
        </rect>
        <text
          v-if="showValue && p.count" :x="bx(i) + slot / 2" :y="y(p.count) - 5" text-anchor="middle" font-size="11"
          :fill="p.recurrence ? CHART.red : '#4a5160'" :font-weight="p.recurrence ? 700 : 500"
        >{{ p.count }}</text>
        <text v-if="i % labelEvery === 0" :x="bx(i) + slot / 2" :y="height - 9" text-anchor="middle" font-size="11" :fill="CHART.label">{{ p.label }}</text>
      </g>

      <!-- 구간 평균 (점선 + 끝 값) -->
      <g v-if="beforeAvg != null">
        <line :x1="pad.l" :x2="split < 0 ? W - pad.r : splitX" :y1="y(beforeAvg)" :y2="y(beforeAvg)" stroke="#8a919d" stroke-dasharray="5 4" />
      </g>
      <g v-if="afterAvg != null && split >= 0">
        <line :x1="splitX" :x2="W - pad.r" :y1="y(afterAvg)" :y2="y(afterAvg)" :stroke="CHART.orange" stroke-dasharray="5 4" />
      </g>

      <!-- 대책 완료: 세로선은 그래프 영역만, 배지는 위 여백에 -->
      <template v-if="split >= 0">
        <line :x1="splitX" :x2="splitX" :y1="BADGE_H + 4" :y2="y(0)" :stroke="CHART.orange" stroke-width="1.5" stroke-dasharray="4 3" />
        <rect :x="badgeX" y="2" :width="badgeW" :height="BADGE_H" rx="11" fill="#fff4ec" :stroke="CHART.orange" />
        <text :x="badgeX + badgeW / 2" :y="2 + BADGE_H / 2 + 4" text-anchor="middle" font-size="11.5" font-weight="700" :fill="CHART.orangeText">{{ badgeText }}</text>
      </template>
    </svg>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-chart-label">
      <span class="flex items-center gap-1.5"><i class="inline-block size-2.5 rounded-[3px] bg-[#dce0e7]" />대책 전</span>
      <span class="flex items-center gap-1.5"><i class="inline-block size-2.5 rounded-[3px] bg-sk-orange" />대책 후</span>
      <span class="flex items-center gap-1.5"><i class="inline-block size-2.5 rounded-[3px] bg-sk-red" />재발 의심 주차</span>
      <span v-if="beforeAvg != null" class="flex items-center gap-1.5"><i class="inline-block w-4 border-t border-dashed border-[#8a919d]" />대책 전 평균 <b class="font-semibold text-foreground tabular">{{ beforeAvg }}건</b></span>
      <span v-if="afterAvg != null && split >= 0" class="flex items-center gap-1.5"><i class="inline-block w-4 border-t border-dashed border-sk-orange" />대책 후 평균 <b class="font-semibold text-[#c4621a] tabular">{{ afterAvg }}건</b></span>
      <span class="ml-auto">y축 주간 발생 건수(건), x축 주 시작일</span>
    </div>
  </div>
</template>
