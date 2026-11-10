<script setup>
import { Info } from 'lucide-vue-next'
import Badge from './ui/Badge.vue'
import HoverTip from './ui/HoverTip.vue'
import { SEVERITY_TONE } from '@/lib/badges'

// 표 열 이름 "위험도" + 산정 기준 (backend logic.quality_priority 의 high_risk · top_severity)
</script>

<template>
  <HoverTip :width="290" :delay="0">
    <span class="inline-flex cursor-help items-center gap-1" tabindex="0">위험도 <Info class="size-3.5" /></span>
    <template #content>
      <p class="mb-2 font-semibold">위험도 산정 기준</p>
      <div class="flex items-start gap-2">
        <Badge tone="red" class="shrink-0">고위험</Badge>
        <ul class="space-y-0.5 text-muted-foreground">
          <li>아래 중 하나라도 해당하면 고위험</li>
          <li>심각도 CRITICAL 사례 포함</li>
          <li>재발로 표시된 사례 포함</li>
          <li>최근 30일 접수 3건 이상</li>
        </ul>
      </div>
      <div class="mt-2 border-t pt-2">
        <p class="mb-1.5 text-muted-foreground">그 외에는 사례 중 가장 높은 심각도</p>
        <div class="flex flex-wrap gap-1">
          <Badge v-for="s in ['HIGH', 'MEDIUM', 'LOW']" :key="s" :tone="SEVERITY_TONE[s]">{{ s }}</Badge>
        </div>
      </div>
    </template>
  </HoverTip>
</template>
