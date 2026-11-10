<script setup>
import { Sparkles } from 'lucide-vue-next'

defineProps({ text: { type: String, default: 'AI가 생성한 분석 초안입니다. 원인과 조치는 담당자가 최종 확정합니다.' } })
</script>

<template>
  <p class="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
    <Sparkles class="size-3.5 shrink-0" />{{ text }}
  </p>
</template>
