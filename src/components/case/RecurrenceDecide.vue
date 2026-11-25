<script setup>
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'
import { RECURRENCE, pick } from '@/lib/caseLabels'

// 재발 여부 최초 확정 (품질관리자, POST /rmas/{id}/recurrence). 원인 승인·확인 뒤에 한다
// AI의 재발 판정(recurrence_check)은 참고만 하고, 확정은 사람이 한다
const props = defineProps({ rmaId: String, ai: Object })
const emit = defineEmits(['decided'])

const CHOICES = [
  { value: 'RECURRENCE', label: '재발' },
  { value: 'SPREAD_RECURRENCE', label: '확산형 재발' },
  { value: 'NEW', label: '신규' },
]
const aiLabel = computed(() => (props.ai?.status ? pick(RECURRENCE, props.ai.status).label : null))

const saving = ref('')
const done = ref(null)
async function decide(decision) {
  saving.value = decision
  try {
    const res = await api(`/rmas/${props.rmaId}/recurrence`, { method: 'POST', body: { decision } })
    done.value = { label: CHOICES.find((c) => c.value === (res?.decision || decision))?.label, by: res?.decided_by }
    toast({ title: `재발 여부를 ‘${done.value.label}’로 확정했습니다`, tone: 'green' })
    emit('decided')
  } catch (e) {
    toast({ title: e.message, tone: 'red' }) // 이미 확정한 건이면 서버가 거절한다
  } finally {
    saving.value = ''
  }
}
</script>

<template>
  <section aria-label="재발 여부 확정" class="rounded-[14px] border bg-card shadow-card p-5">
    <header class="flex flex-wrap items-center gap-2">
      <h3 class="text-[15px] font-bold">재발 여부 확정</h3>
      <Badge v-if="aiLabel" tone="gray">AI 판정 {{ aiLabel }}</Badge>
      <span class="ml-auto text-xs text-muted-foreground">최초 확정은 한 번만 할 수 있습니다</span>
    </header>
    <p v-if="done" class="mt-3 text-sm"><b>{{ done.label }}</b>으로 확정했습니다<span v-if="done.by" class="text-muted-foreground"> · {{ done.by }}</span></p>
    <div v-else class="mt-3 flex flex-wrap gap-2">
      <Button v-for="c in CHOICES" :key="c.value" size="sm" variant="outline" :loading="saving === c.value" :disabled="!!saving" @click="decide(c.value)">{{ c.label }}</Button>
    </div>
  </section>
</template>
