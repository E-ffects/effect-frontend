<script setup>
import { Info } from 'lucide-vue-next'
import Badge from './ui/Badge.vue'
import HoverTip from './ui/HoverTip.vue'
import { IMPORTANCE_TONE } from '@/lib/badges'

// 표 열 이름 "제품 중요도" + 등급 기준 (데이터 products.importance_score · backend logic.IMPORTANCE_SCORE)
const GRADES = [
  { g: '상', range: '70점 이상', pts: 100 },
  { g: '중', range: '40점 이상 70점 미만', pts: 60 },
  { g: '하', range: '40점 미만', pts: 20 },
]
</script>

<template>
  <HoverTip :width="300" :delay="0">
    <span class="inline-flex cursor-help items-center gap-1" tabindex="0">제품 중요도 <Info class="size-3.5" /></span>
    <template #content>
      <p class="mb-1 font-semibold">제품 중요도 등급 기준</p>
      <p class="mb-2 text-muted-foreground">제품 중요도 점수(0~100)로 등급을 나눕니다.</p>
      <ul class="space-y-1">
        <li v-for="r in GRADES" :key="r.g" class="flex items-center gap-2">
          <Badge :tone="IMPORTANCE_TONE[r.g]" class="shrink-0">{{ r.g }}</Badge>
          <span class="flex-1">{{ r.range }}</span>
          <span class="text-muted-foreground tabular">우선순위 {{ r.pts }}점</span>
        </li>
      </ul>
      <div class="mt-2 border-t pt-2 text-muted-foreground">
        <p class="mb-1 font-medium text-foreground">중요도 점수 구성</p>
        <p>출하량 비중 60%, 출시 6개월 이내 25%, 제품군 15%</p>
        <p class="mt-0.5">제품군 점수: 엔터프라이즈 100, 클라이언트 50</p>
      </div>
    </template>
  </HoverTip>
</template>
