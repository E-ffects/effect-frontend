<script setup>
import StarRating from './StarRating.vue'

// 제품 순위 표: 순번 · 제품 · 선택 기간 RMA 건수 · 고객 만족도(별점·평균·응답 수)
// low: 만족도 최하위 목록 (1위 칩과 평균 점수를 주황으로 강조)
defineProps({
  rows: { type: Array, default: () => [] }, // by_product 항목
  low: Boolean,
})
defineEmits(['select'])
</script>

<template>
  <table class="w-full table-fixed text-sm">
    <colgroup><col class="w-10" /><col /><col class="w-20" /><col class="w-[200px]" /></colgroup>
    <thead class="text-left text-xs text-muted-foreground">
      <tr><th class="pb-2 font-medium" /><th class="pb-2 font-medium">제품</th><th class="pb-2 font-medium">RMA</th><th class="pb-2 font-medium">고객 만족도</th></tr>
    </thead>
    <tbody>
      <tr v-for="(p, i) in rows" :key="p.product" class="cursor-pointer border-t border-[#f1f2f5] hover:bg-muted/50" @click="$emit('select', p)">
        <td class="py-2.5">
          <span
            :class="i === 0 ? (low ? 'bg-[#fff1e6] text-[#c4621a]' : 'bg-brand-soft text-primary') : 'bg-chart-track text-[#6f7684]'"
            class="grid size-[25px] place-items-center rounded-[7px] text-[12px] font-bold tabular"
          >{{ String(i + 1).padStart(2, '0') }}</span>
        </td>
        <td class="truncate py-2.5 font-semibold" :title="`${p.product} ${p.name}`">{{ p.product }} <span class="font-normal text-muted-foreground">{{ p.name }}</span></td>
        <td class="py-2.5 text-[15px] font-bold tabular">{{ p.count }}<small class="ml-0.5 text-[12px] font-normal text-[#6f7684]">건</small></td>
        <td class="py-2.5">
          <span v-if="p.satisfaction != null" class="flex items-center gap-2" :title="`응답 ${p.satisfaction_n}건 평균`">
            <StarRating :value="p.satisfaction" />
            <b :class="low && i === 0 ? 'text-[#c4621a]' : ''" class="font-semibold tabular">{{ p.satisfaction.toFixed(2) }}</b>
            <small class="text-[11px] text-muted-foreground tabular">({{ p.satisfaction_n }})</small>
          </span>
          <span v-else class="text-xs text-muted-foreground">응답 없음</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
