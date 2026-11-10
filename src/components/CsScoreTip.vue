<script setup>
import { Info } from 'lucide-vue-next'
import HoverTip from './ui/HoverTip.vue'

// 표 열 이름 "점수" + 고객 응대 우선순위 산정 기준 (backend logic.cs_priority · CS_WEIGHTS)
const PARTS = [
  { label: '심각도', w: 30, how: 'CRITICAL 100, HIGH 70, MEDIUM 40, LOW 10, 판정 보류 0' },
  { label: '처리 경과일', w: 25, how: '14일이면 100점 (하루당 약 7점, 최대 100)' },
  { label: '제품 중요도', w: 25, how: '상 100, 중 60, 하 20' },
  { label: '클레임 수량', w: 20, how: '1개 20, 2~4개 50, 5~9개 80, 10개 이상 100' },
]
</script>

<template>
  <HoverTip :width="360" :delay="0">
    <span class="inline-flex cursor-help items-center gap-1" tabindex="0">점수 <Info class="size-3.5" /></span>
    <template #content>
      <p class="mb-2 font-semibold">우선순위 점수 산정 기준 (100점 만점)</p>
      <table class="w-full">
        <tbody>
          <tr v-for="p in PARTS" :key="p.label" class="border-t first:border-0">
            <td class="whitespace-nowrap py-1.5 pr-2 align-top font-medium">{{ p.label }}</td>
            <td class="py-1.5 pr-2 align-top tabular text-primary">{{ p.w }}%</td>
            <td class="py-1.5 align-top leading-snug text-muted-foreground">{{ p.how }}</td>
          </tr>
        </tbody>
      </table>
      <ul class="mt-2 space-y-0.5 border-t pt-2 text-muted-foreground">
        <li>점수 = 각 항목 점수 × 가중치의 합</li>
        <li>심각도 CRITICAL은 점수와 관계없이 최상단 고정</li>
        <li>처리완료 건은 제외</li>
        <li>각 행의 점수 ⓘ에서 항목별 계산을 볼 수 있습니다</li>
      </ul>
    </template>
  </HoverTip>
</template>
