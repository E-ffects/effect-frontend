<script setup>
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { fmtDateTime } from '@/lib/api'

// 기록한 회신 이력 (1차·2차 공통). 목록은 CaseView가 불러와 내려준다
// 보낸 순서대로 CS가 보낸 첫 회신은 1차, 두 번째는 2차, 그 뒤는 추가 회신으로 표시한다
const props = defineProps({ items: { type: Array, default: () => [] } })

const ORDER = ['1차 회신', '2차 회신']
const rows = computed(() => {
  const sorted = [...props.items].sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)))
  let n = 0
  return sorted.map((m) => {
    // author_role customer: 고객이 보낸 것, audience가 customer가 아니면 사내 공유(품질관리자에게만 보임)
    if (m.author_role === 'customer') return { ...m, label: '고객 회신', tone: 'gray' }
    if (m.audience && m.audience !== 'customer') return { ...m, label: `사내 · ${m.audience}`, tone: 'outline' }
    const label = ORDER[n++] || '추가 회신'
    return { ...m, label, tone: label === '2차 회신' ? 'green' : 'blue' }
  })
})
</script>

<template>
  <section v-if="rows.length" class="rounded-[14px] border bg-card p-5">
    <h3 class="text-[15px] font-bold">회신 이력</h3>
    <ul class="mt-3 grid gap-3">
      <li v-for="m in rows" :key="m.message_id" class="text-xs">
        <p class="flex items-center gap-2 text-muted-foreground tabular">
          <Badge :tone="m.tone">{{ m.label }}</Badge>{{ fmtDateTime(m.sent_at) }} · {{ m.author_name || '담당자' }}
        </p>
        <p class="mt-1 whitespace-pre-line text-[#3b404a]">{{ m.message_text }}</p>
      </li>
    </ul>
  </section>
</template>
