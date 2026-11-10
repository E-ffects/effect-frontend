<script setup>
import { Info } from 'lucide-vue-next'
import Badge from './ui/Badge.vue'
import HoverTip from './ui/HoverTip.vue'
import { SEVERITY_TONE } from '@/lib/badges'

// 표 열 이름 "심각도" + 판정 기준 (데이터 README 심각도 정의 · backend logic.SEVERITY_SCORE)
const LEVELS = [
  { s: 'CRITICAL', desc: '데이터 무결성 손상 또는 안전 영향 확인', pts: 100 },
  { s: 'HIGH', desc: '기본 저장 기능 사용 불가 확인', pts: 70 },
  { s: 'MEDIUM', desc: '읽기와 쓰기는 되나 성능 저하 재현', pts: 40 },
  { s: 'LOW', desc: '포장 손상, SSD 기능 검사는 통과', pts: 10 },
  { s: '판정 보류', desc: '검사 증거가 아직 없음', pts: 0 },
]
</script>

<template>
  <HoverTip :width="340" :delay="0" align="end">
    <span class="inline-flex cursor-help items-center gap-1" tabindex="0">심각도 <Info class="size-3.5" /></span>
    <template #content>
      <p class="mb-2 font-semibold">심각도 판정 기준</p>
      <ul class="space-y-1.5">
        <li v-for="l in LEVELS" :key="l.s" class="flex items-start gap-2">
          <Badge :tone="SEVERITY_TONE[l.s] || 'gray'" class="w-[74px] shrink-0 justify-center">{{ l.s }}</Badge>
          <span class="flex-1 leading-snug">{{ l.desc }}</span>
          <span class="shrink-0 text-muted-foreground tabular">{{ l.pts }}점</span>
        </li>
      </ul>
      <p class="mt-2 border-t pt-2 text-muted-foreground">오른쪽 점수는 우선순위 점수의 심각도 항목(30%)에 들어가는 값입니다. CRITICAL은 점수와 관계없이 맨 위에 고정됩니다.</p>
    </template>
  </HoverTip>
</template>
