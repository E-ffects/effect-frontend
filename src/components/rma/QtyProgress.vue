<script setup>
import { computed } from 'vue'

// 수량 한 줄 (v13 다수 반품): 접수 N개 · 검사 M개 · 확인 불량 K개, 여러 대짜리면 검사 진행 막대
const props = defineProps({ claim: Number, inspected: Number, defect: Number })
const pct = computed(() => (props.claim ? Math.min(100, Math.round(((props.inspected ?? 0) / props.claim) * 100)) : 0))
const done = computed(() => props.inspected != null && props.inspected >= props.claim)
</script>

<template>
  <span class="block tabular">
    <span>접수 <b class="font-bold">{{ claim }}</b>개</span>
    <span class="mx-1.5 text-border">/</span>
    <span>검사 <b class="font-bold">{{ inspected ?? 0 }}</b>개</span>
    <span class="mx-1.5 text-border">/</span>
    <span v-if="defect != null">확인 불량 <b class="font-bold" :class="defect ? 'text-sk-red' : ''">{{ defect }}</b>개</span>
    <span v-else class="text-muted-foreground">불량 검사 대기</span>
    <span v-if="claim > 1" class="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
      <span class="h-1.5 w-28 overflow-hidden rounded bg-chart-track">
        <span :class="done ? 'bg-[#20866a]' : 'bg-sk-orange'" class="block h-full rounded" :style="{ width: pct + '%' }" />
      </span>
      {{ done ? '전수 검사 완료' : `검사 진행 ${pct}%` }}
    </span>
  </span>
</template>
