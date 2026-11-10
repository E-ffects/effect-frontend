<script setup>
import { Star } from 'lucide-vue-next'

// 5점 만점 별점: 평균값만큼 노란 별을 채운다 (4.3 → 별 4개 + 0.3개)
const props = defineProps({ value: Number, size: { type: Number, default: 15 } })
const fill = (i) => Math.max(0, Math.min(1, (props.value || 0) - (i - 1))) * 100
</script>

<template>
  <span class="inline-flex items-center gap-px" role="img" :aria-label="`5점 만점에 ${value ?? '-'}점`">
    <span v-for="i in 5" :key="i" class="relative inline-block" :style="{ width: size + 'px', height: size + 'px' }">
      <Star :size="size" class="absolute inset-0 fill-[#eceef1] text-[#eceef1]" :stroke-width="1.5" />
      <span class="absolute inset-y-0 left-0 overflow-hidden" :style="{ width: fill(i) + '%' }">
        <Star :size="size" class="fill-[#f5b301] text-[#f5b301]" :stroke-width="1.5" />
      </span>
    </span>
  </span>
</template>
