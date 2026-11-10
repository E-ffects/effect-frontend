<script setup>
import { Info } from 'lucide-vue-next'
import Badge from './ui/Badge.vue'
import HoverTip from './ui/HoverTip.vue'
import { URGENCY_TONE } from '@/lib/badges'

// 표 열 이름 "긴급도" + 산정 기준 (backend logic.quality_priority: 70 이상 즉시 · 50 이상 금주내 · 그 외 금월내)
const RULES = [
  { label: '즉시', range: '70점 이상' },
  { label: '금주내', range: '50 ~ 69.9점' },
  { label: '금월내', range: '50점 미만' },
]
</script>

<template>
  <HoverTip :width="250" :delay="0">
    <span class="inline-flex cursor-help items-center gap-1" tabindex="0">긴급도 <Info class="size-3.5" /></span>
    <template #content>
      <p class="mb-2 font-semibold">긴급도 산정 기준</p>
      <ul class="space-y-1">
        <li v-for="r in RULES" :key="r.label" class="flex items-center justify-between text-muted-foreground">
          <Badge :tone="URGENCY_TONE[r.label]">{{ r.label }}</Badge><span class="tabular">우선순위 점수 {{ r.range }}</span>
        </li>
      </ul>
    </template>
  </HoverTip>
</template>
