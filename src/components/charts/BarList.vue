<script setup>
import { computed } from 'vue'

// 가로 막대 (v4: 이름 | 트랙 | 값). 가장 많은 항목은 진한 색, 나머지는 옅은 색. 막대를 누르면 select.
// 모든 행이 한 격자를 공유해 이름 칸은 가장 긴 이름만큼만(최대 labelWidth) — 막대가 이름 바로 뒤에서 왼쪽 정렬로 시작한다.
const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ key, label, value }]
  unit: { type: String, default: '건' },
  tone: { type: String, default: 'red' }, // red(SK Red) | orange(SK Orange)
  labelWidth: { type: String, default: '11rem' }, // 이름 칸 최대 폭 (넘으면 말줄임)
  axis: { type: Boolean, default: true },
})
defineEmits(['select'])

const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))
const TONES = {
  red: ['bg-sk-red', 'bg-sk-red-light'],
  orange: ['bg-sk-orange', 'bg-[#f9bb92]'],
}
// 최댓값 막대만 진한 색 (정렬 기준이 건수가 아닌 목록에서도 가장 많은 항목이 강조되도록)
const fill = (it) => TONES[props.tone][it.value === max.value ? 0 : 1]
</script>

<template>
  <!-- 카드 높이가 내용보다 크면 행 간격을 넓혀 빈칸 없이 채운다 -->
  <div
    class="grid h-full content-between items-center gap-x-4 gap-y-4"
    :style="{ gridTemplateColumns: `fit-content(${labelWidth}) minmax(0,1fr) auto` }"
  >
    <button
      v-for="it in items"
      :key="it.key"
      class="group col-span-3 grid grid-cols-subgrid items-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      :title="`${it.label} ${it.value.toLocaleString()}${unit}`"
      @click="$emit('select', it)"
    >
      <span class="min-w-0">
        <span class="block truncate text-xs text-[#4b5260] group-hover:text-foreground">{{ it.label }}</span>
        <span v-if="$slots.extra" class="mt-1 flex items-center gap-1.5"><slot name="extra" :item="it" /></span>
      </span>
      <span class="h-[11px] overflow-hidden rounded bg-chart-track">
        <span :class="fill(it)" class="block h-full rounded transition-[width,filter] duration-500 ease-out group-hover:brightness-90" :style="{ width: (it.value / max) * 100 + '%' }" />
      </span>
      <span class="min-w-[3.5rem] text-right text-xs font-semibold tabular">{{ it.value.toLocaleString() }}<small class="ml-0.5 font-normal text-chart-label">{{ unit }}</small></span>
    </button>
    <div v-if="axis && items.length" class="col-start-2 -mt-1 flex justify-between text-[12px] text-chart-label tabular">
      <span>0</span><span>{{ Math.round(max / 2) }}</span><span>{{ max }}{{ unit }}</span>
    </div>
  </div>
</template>
