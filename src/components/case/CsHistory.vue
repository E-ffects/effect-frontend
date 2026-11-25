<script setup>
import { fmtDateTime } from '@/lib/api'

// 기록한 회신 이력 (1차·2차 공통). 목록은 CaseView가 불러와 내려준다
defineProps({ items: { type: Array, default: () => [] } })
</script>

<template>
  <section v-if="items.length" class="rounded-[14px] border bg-card p-5">
    <h3 class="text-[15px] font-bold">회신 이력</h3>
    <ul class="mt-3 grid gap-3">
      <li v-for="m in items" :key="m.message_id" class="text-xs">
        <p class="text-muted-foreground tabular">{{ fmtDateTime(m.sent_at) }} · {{ m.author_name || '담당자' }}</p>
        <p class="mt-0.5 whitespace-pre-line text-[#3b404a]">{{ m.message_text }}</p>
      </li>
    </ul>
  </section>
</template>
