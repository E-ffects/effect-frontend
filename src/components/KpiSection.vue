<script setup>
import { Info } from 'lucide-vue-next'
import HoverTip from './ui/HoverTip.vue'

// KPI 영역 (v4): 왼쪽 OVERVIEW(주요 현황) | 세로 구분선 | 오른쪽 PERFORMANCE(성과, 가안).
// 폭은 카드 수에 비례한다. 양쪽 카드 높이는 더 큰 쪽에 맞춘다 (flex-1 + 격자 늘림).
defineProps({
  overviewLabel: { type: String, default: '주요 현황' },
  performanceLabel: String,
  overview: { type: Number, default: 4 },
  performance: { type: Number, default: 2 },
})
</script>

<template>
  <!-- 2xl 미만(또는 우측 에이전트 패널 열림 시 좁은 본문)에서는 OVERVIEW(위) / PERFORMANCE(아래)로 자연스럽게 쌓여 겹침을 방지 -->
  <div class="mb-4 grid grid-cols-1 gap-4 2xl:grid-cols-[2fr_1fr] 2xl:gap-0">
    <section class="flex min-w-0 flex-col border-b border-[#d8dce3] pb-4 2xl:border-b-0 2xl:border-r 2xl:pb-0 2xl:pr-4">
      <p class="mb-2.5 text-[12px] font-semibold tracking-[0.6px] text-muted-foreground">OVERVIEW {{ overviewLabel }}</p>
      <div class="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4"><slot name="overview" /></div>
    </section>
    <section class="flex min-w-0 flex-col 2xl:pl-4">
      <p class="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.6px] text-muted-foreground">
        PERFORMANCE {{ performanceLabel }}
        <HoverTip :width="240" :delay="300">
          <span class="inline-flex items-center gap-0.5 text-[12px] font-bold tracking-normal text-foreground">가안 <Info class="size-3" /></span>
          <template #content>성과 KPI의 산식과 목표값은 확정 전 가안입니다. 각 카드의 ⓘ에서 산정 기준을 확인하세요.</template>
        </HoverTip>
      </p>
      <div class="grid flex-1 grid-cols-2 gap-3"><slot name="performance" /></div>
    </section>
  </div>
</template>
