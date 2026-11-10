<script setup>
import { fmtDateTime } from '@/lib/api'

// ② 처리·대응 현황: 접수부터 현재까지 시간순
defineProps({ events: Array, completed: Boolean, status: String })
const NEXT = { 접수: '분석중', 분석중: '원인확정', 원인확정: '처리완료' }
</script>

<template>
  <!-- ml-1.5: 바깥 스크롤 영역(overflow)에 점이 잘리지 않게 선을 안쪽으로 --><ol class="relative ml-1.5 space-y-4 border-l pl-5">
    <li v-for="e in events" :key="e.id" class="relative">
      <span :class="e.kind === 'record' ? 'bg-primary' : 'bg-card border-2 border-primary'" class="absolute -left-[25px] top-1 size-2.5 rounded-full" />
      <p class="flex items-center gap-2 text-xs">
        <b class="font-semibold">{{ e.stage }}</b>
        <span class="text-muted-foreground">{{ fmtDateTime(e.ts) }}, {{ e.actor }}</span>
        <span v-if="e.kind === 'record'" class="rounded bg-muted px-1 text-[12px]">처리 기록</span>
      </p>
      <p class="mt-0.5 text-sm">{{ e.method }}</p>
      <p v-if="e.result" class="text-xs text-muted-foreground">결과: {{ e.result }}<span v-if="e.updated_at">, 수정됨</span></p>
    </li>
    <li v-if="!completed && NEXT[status]" class="relative">
      <span class="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-dashed border-zinc-300 bg-card" />
      <p class="text-xs text-muted-foreground"><b class="font-medium">{{ NEXT[status] }}</b> 대기</p>
    </li>
  </ol>
</template>
