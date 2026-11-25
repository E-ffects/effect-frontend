<script setup>
import { computed, ref, watch } from 'vue'
import { Copy, Send } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'
import { CS_STATUS, pick } from '@/lib/caseLabels'

// 고객대응관리자 OUTPUT 1차 회신 (Spring_API_v6 4-7): 회신 초안 수정 → 회신 기록
// 처리방안과 2차 회신은 원인 확정 뒤에 열린다 (CsFollowUp)
const props = defineProps({ rma: Object, analysis: Object })
const emit = defineEmits(['changed'])

const drafts = computed(() => props.analysis?.result?.drafts || {})
const needsInfo = computed(() => props.rma.intake_state === 'NEEDS_INFO')

const text = ref('')
const source = computed(() => (needsInfo.value ? 'AI_DRAFT' : text.value === (drafts.value.customer_reply || '') ? 'AI_DRAFT' : 'AI_DRAFT_EDITED'))
watch(() => [drafts.value.customer_reply, props.rma.follow_up_questions], () => {
  if (text.value) return
  text.value = needsInfo.value ? (props.rma.follow_up_questions || []).join('\n') : drafts.value.customer_reply || ''
}, { immediate: true })

const sending = ref(false)
async function record() {
  sending.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/communications`, { method: 'POST', body: { message_text: text.value.trim(), source: source.value, analysis_id: props.analysis?.analysis_id || null } })
    toast({ title: '회신을 기록했습니다', tone: 'green' })
    emit('changed')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    sending.value = false
  }
}
async function copy() {
  await navigator.clipboard.writeText(text.value)
  toast({ title: '회신 문구를 복사했습니다', tone: 'green' })
}

const closed = computed(() => props.rma.cs_status === 'CLOSED')
</script>

<template>
  <section class="rounded-[14px] border-2 border-primary/25 bg-card p-5">
    <header class="flex items-center gap-2">
      <h3 class="text-[15px] font-bold">{{ needsInfo ? '고객 재질의' : '1차 회신' }}</h3>
      <Badge :tone="pick(CS_STATUS, rma.cs_status).tone">{{ pick(CS_STATUS, rma.cs_status).label }}</Badge>
      <span class="ml-auto text-xs text-muted-foreground">{{ needsInfo ? '원문으로 증상을 확인할 수 없어 추가 정보를 요청합니다' : '유력 원인 확인 중 단계' }}</span>
    </header>
    <textarea
      v-model="text" rows="7" :disabled="closed" aria-label="1차 회신 문구"
      class="mt-3 w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:bg-muted/50"
    />
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted-foreground">{{ source === 'AI_DRAFT' ? 'AI 초안 그대로' : '수정됨' }} · 메일은 복사해서 보내고, 보낸 사실을 기록합니다</span>
      <Button size="sm" variant="outline" class="ml-auto" :disabled="!text.trim()" @click="copy"><Copy class="size-3.5" />복사</Button>
      <Button size="sm" :loading="sending" :disabled="closed || text.trim().length < 10" @click="record"><Send class="size-3.5" />회신 기록</Button>
    </div>
  </section>
</template>
