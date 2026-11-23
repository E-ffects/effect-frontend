<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Copy, PackageCheck, Send } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { api, fmtDateTime } from '@/lib/api'
import { toast } from '@/lib/state'
import { ACTION_TYPE, CS_STATUS, pick } from '@/lib/caseLabels'

// 고객대응관리자 OUTPUT (Spring_API_v5 4-7): 회신 초안 수정 → 회신 기록, 처리방안 → 처리 실행
const props = defineProps({ rma: Object, analysis: Object })
const emit = defineEmits(['changed'])

const drafts = computed(() => props.analysis?.result?.drafts || {})
const needsInfo = computed(() => props.rma.intake_state === 'NEEDS_INFO')
const suggestion = computed(() => drafts.value.service_action)
const level = computed(() => props.rma.triage?.analysis_level)

const text = ref('')
const source = computed(() => (needsInfo.value ? 'AI_DRAFT' : text.value === (drafts.value.customer_reply || '') ? 'AI_DRAFT' : 'AI_DRAFT_EDITED'))
watch(() => [drafts.value.customer_reply, props.rma.follow_up_questions], () => {
  if (text.value) return
  text.value = needsInfo.value ? (props.rma.follow_up_questions || []).join('\n') : drafts.value.customer_reply || ''
}, { immediate: true })

const history = ref([])
async function loadHistory() {
  try {
    history.value = (await api(`/rmas/${props.rma.rma_id}/communications`)).items
  } catch {
    history.value = []
  }
}
onMounted(loadHistory)

const sending = ref(false)
async function record() {
  sending.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/communications`, { method: 'POST', body: { message_text: text.value.trim(), source: source.value, analysis_id: props.analysis?.analysis_id || null } })
    toast({ title: '회신을 기록했습니다', tone: 'green' })
    await loadHistory()
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

const action = ref('')
const qty = ref('')
// 제안이 있으면 그 처리·수량으로, 없으면(과거 처리 기록 없음) 신고 불량 수량만 채워 두고 CS가 고른다
watch(suggestion, (s) => {
  if (action.value) return
  if (s) {
    action.value = s.action_type
    qty.value = s.board_qty
  } else {
    qty.value = props.rma.items?.[0]?.claimed_defect_qty ?? ''
  }
}, { immediate: true })
watch(action, (a) => {
  if (a === 'NO_CHARGE_SAMPLE_RETURN') qty.value = 0
  else if (Number(qty.value) === 0) qty.value = props.rma.items?.[0]?.claimed_defect_qty ?? ''
})
const qtyOk = computed(() => Number(qty.value) >= (action.value === 'NO_CHARGE_SAMPLE_RETURN' ? 0 : 1))
const acting = ref(false)
async function execute(result) {
  acting.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/service-action`, { method: 'POST', body: { action_type: action.value, board_qty: Number(qty.value), result, source: action.value === suggestion.value?.action_type ? 'AI_SUGGESTED' : 'MANUAL' } })
    toast({ title: result === 'EXECUTED' ? '처리를 실행했습니다. 접수가 종료됩니다' : '처리를 예약했습니다', tone: 'green' })
    emit('changed')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    acting.value = false
  }
}
const actionOptions = Object.entries(ACTION_TYPE).map(([value, label]) => ({ value, label }))
const closed = computed(() => props.rma.cs_status === 'CLOSED')
</script>

<template>
  <div class="grid gap-4">
    <section class="rounded-[14px] border-2 border-primary/25 bg-card p-5">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">{{ needsInfo ? '고객 재질의' : '고객 회신' }}</h3>
        <Badge :tone="pick(CS_STATUS, rma.cs_status).tone">{{ pick(CS_STATUS, rma.cs_status).label }}</Badge>
        <span class="ml-auto text-xs text-muted-foreground">{{ needsInfo ? '원문으로 증상을 확인할 수 없어 추가 정보를 요청합니다' : '1차 회신 · 유력 원인 확인 중 단계' }}</span>
      </header>
      <textarea
        v-model="text" rows="7" :disabled="closed" aria-label="회신 문구"
        class="mt-3 w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:bg-muted/50"
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ source === 'AI_DRAFT' ? 'AI 초안 그대로' : '수정됨' }} · 메일은 복사해서 보내고, 보낸 사실을 기록합니다</span>
        <Button size="sm" variant="outline" class="ml-auto" :disabled="!text.trim()" @click="copy"><Copy class="size-3.5" />복사</Button>
        <Button size="sm" :loading="sending" :disabled="closed || text.trim().length < 10" @click="record"><Send class="size-3.5" />회신 기록</Button>
      </div>
      <ul v-if="history.length" class="mt-3 grid gap-2 border-t pt-3">
        <li v-for="m in history" :key="m.message_id" class="text-xs">
          <p class="text-muted-foreground tabular">{{ fmtDateTime(m.sent_at) }} · {{ m.author_name }}</p>
          <p class="mt-0.5 line-clamp-2 text-[#3b404a]">{{ m.message_text }}</p>
        </li>
      </ul>
    </section>

    <section v-if="!needsInfo" class="rounded-[14px] border bg-card p-5">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">처리방안</h3>
        <Badge :tone="suggestion ? 'blue' : 'gray'">{{ suggestion ? 'AI 제안' : '제안 없음' }}</Badge>
        <span class="ml-auto text-xs text-muted-foreground">처리 결정은 담당자가 합니다</span>
      </header>

      <div v-if="suggestion" class="mt-3 rounded-lg bg-muted/60 p-3.5">
        <p class="text-sm">
          <b class="text-[15px] font-semibold">{{ suggestion.action_name || ACTION_TYPE[suggestion.action_type] }}</b>
          <span class="tabular"> · {{ suggestion.board_qty.toLocaleString() }}개 · 예상 {{ suggestion.expected_days }}일</span>
        </p>
        <p class="mt-1 text-xs text-[#3b404a]">{{ suggestion.basis }}</p>
        <p v-if="suggestion.expected_days_basis" class="mt-0.5 text-xs text-muted-foreground">예상 일수: {{ suggestion.expected_days_basis }}</p>
        <p v-if="suggestion.alternatives?.length" class="mt-2 text-xs text-muted-foreground">
          다른 처리:
          <template v-for="(a, i) in suggestion.alternatives" :key="a.action_type">{{ i ? ', ' : '' }}{{ a.action_name || ACTION_TYPE[a.action_type] }} {{ a.count }}건</template>
        </p>
        <p class="mt-2 text-[12px] text-muted-foreground">유사 사례의 실제 처리 기록 기준 제안입니다. 과거 반품에서 실제 처리와 68% 일치했습니다.</p>
      </div>
      <p v-else class="mt-3 rounded-lg bg-muted/60 p-3.5 text-sm text-[#3b404a]">비슷한 과거 반품의 처리 기록이 없어 제안할 처리방안이 없습니다. 고객 요청과 분석 결과를 보고 직접 고르세요.</p>

      <p v-if="rma.customer_request && rma.customer_request !== (suggestion?.action_name || ACTION_TYPE[suggestion?.action_type])" class="mt-2 text-xs text-[#a8711a]">고객 요청: {{ rma.customer_request }}</p>
      <div class="mt-3 grid grid-cols-[1fr_96px] gap-2">
        <Select v-model="action" :options="actionOptions" placeholder="처리 방법 선택" class="w-full" aria-label="처리 방법" />
        <input v-model="qty" type="number" :min="action === 'NO_CHARGE_SAMPLE_RETURN' ? 0 : 1" aria-label="처리 수량" class="h-9 rounded-md border bg-card px-3 text-sm tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      </div>
      <p v-if="level === 'L3' && !closed" class="mt-2 text-xs text-muted-foreground">L3 건은 품질관리자의 원인 판정이 끝나야 처리를 실행할 수 있습니다.</p>
      <div class="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" :loading="acting" :disabled="closed || !action || !qtyOk" @click="execute('SCHEDULED')">예약</Button>
        <Button size="sm" :loading="acting" :disabled="closed || !action || !qtyOk" @click="execute('EXECUTED')"><PackageCheck class="size-3.5" />처리 실행</Button>
      </div>
    </section>
  </div>
</template>
