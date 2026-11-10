<script setup>
import { Info } from 'lucide-vue-next'
import HoverTip from './ui/HoverTip.vue'

// KPI 카드 (v4): 라벨 + 우상단 아이콘 · 큰 수치 · 한 줄 보조(증감 + 설명).
// 성과 KPI(performance)는 따뜻한 배경 + 주황 ⓘ. formula가 있으면 카드에 마우스·포커스를 올릴 때
// 위쪽에 어두운 계산식 툴팁(산식 · 실제 값 · 기준 안내)을 띄운다.
defineProps({
  label: String,
  value: [String, Number],
  unit: String,
  icon: [Object, Function],
  delta: String, // "▲ 12.3%" · "신규 3" 등 (색 강조)
  deltaTone: { type: String, default: 'muted' }, // up-bad | down-good | up-good | down-bad | warn | muted
  note: String, // 증감 뒤 회색 설명
  formula: Object, // { expr: '분자 ÷ 분모 × 100', calc: '88 ÷ 128 × 100 = 68.8%', note }
  clickable: { type: Boolean, default: true },
  performance: Boolean,
})
defineEmits(['click'])

const toneCls = {
  'up-bad': 'font-semibold text-sk-red',
  'down-bad': 'font-semibold text-sk-red',
  'down-good': 'font-semibold text-[#20866a]',
  'up-good': 'font-semibold text-[#20866a]',
  warn: 'font-semibold text-sk-orange',
  muted: 'text-muted-foreground',
}
</script>

<template>
  <component
    :is="formula ? HoverTip : 'div'"
    v-bind="formula ? { block: true, dark: true, placement: 'top', align: 'end', width: 300, delay: 150 } : { class: 'contents' }"
  >
  <component
    :is="clickable ? 'button' : 'div'"
    :tabindex="!clickable && formula ? 0 : undefined"
    class="group flex min-h-[112px] flex-col rounded-xl border px-4 pb-3.5 pt-4 text-left transition"
    :class="[
      performance ? 'border-perf-line bg-perf' : 'bg-card',
      clickable ? 'hover:-translate-y-0.5 hover:border-brand-line hover:shadow-[0_6px_20px_#242b3710]' : '',
      formula ? 'h-full w-full cursor-help hover:border-[#f0c9ac] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sk-orange/50' : '',
    ]"
    @click="clickable && $emit('click')"
  >
    <span class="flex items-center justify-between gap-2 text-xs text-[#5f6673]">
      {{ label }}
      <Info v-if="formula" class="size-4 text-sk-orange" aria-hidden="true" />
      <component :is="icon" v-else-if="icon" class="size-4 text-[#a4aab4]" aria-hidden="true" />
    </span>
    <span class="mt-3 text-[30px] font-bold leading-none tracking-[-0.03em] tabular">
      {{ value ?? '—' }}<span v-if="unit && value != null" class="ml-1 text-sm font-medium text-[#5f6673]">{{ unit }}</span>
    </span>
    <span class="mt-auto pt-3 text-[12px] leading-tight tabular">
      <slot name="foot">
        <span v-if="delta" :class="toneCls[deltaTone]">{{ delta }}</span>
        <span v-if="note" class="text-[#6f7684]"><template v-if="delta">&nbsp; </template>{{ note }}</span>
      </slot>
    </span>
  </component>
    <template v-if="formula" #content>
      <p class="text-[13px] font-bold text-[#ff8fa3]">{{ label }} 계산식 가안</p>
      <p class="mt-2.5 text-[14px] font-semibold leading-snug">{{ formula.expr }}</p>
      <p class="mt-1 text-[14px] font-semibold leading-snug tabular">{{ formula.calc }}</p>
      <p class="mt-3 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-[#b9bec8]">
        {{ formula.note || '분모가 0이면 —(계산 불가)로 표시합니다. KPI와 산정 기준은 확정 전이며 시연용입니다.' }}
      </p>
    </template>
  </component>
</template>
