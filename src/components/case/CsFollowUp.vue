<script setup>
import { computed, ref, watch } from 'vue'
import { Copy, FileText, Lock, PackageCheck, Send } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'
import { ACTION_TYPE } from '@/lib/caseLabels'

// 원인 확정 뒤 열리는 2차 회신 + 처리방안 (고객대응관리자)
// 상세 응답의 follow_up_draft_available 이 true 일 때만 연다. 버튼은 문안만 불러오고 발송은 기존 절차(복사 → 회신 기록)를 따른다
const props = defineProps({ rma: Object, analysis: Object })
const emit = defineEmits(['changed'])

const rmaId = computed(() => props.rma.rma_id)
const ready = computed(() => props.rma.follow_up_draft_available === true)
const closed = computed(() => props.rma.cs_status === 'CLOSED')
const suggestion = computed(() => props.analysis?.result?.drafts?.service_action)
const level = computed(() => props.rma.triage?.analysis_level)

// ---------- 2차 회신 ----------
const text = ref('')
const draft = ref(null) // 초안 응답의 { analysis_id, source, message_text }
const notReady = ref(false)
const drafting = ref(false)
const edited = computed(() => !!draft.value && text.value !== draft.value.message_text)

async function makeDraft() {
  if (edited.value && !window.confirm('수정한 문안이 사라집니다. 초안을 다시 불러올까요?')) return
  drafting.value = true
  notReady.value = false
  try {
    const res = await api(`/rmas/${rmaId.value}/communications/follow-up-draft`, { method: 'POST' })
    draft.value = { analysis_id: res.analysis_id ?? null, source: res.source, message_text: res.message_text || '' }
    text.value = draft.value.message_text
  } catch (e) {
    if (e.status === 409 && e.code === 'FOLLOW_UP_DRAFT_NOT_READY') notReady.value = true
    else toast({ title: e.message, tone: 'red' })
  } finally {
    drafting.value = false
  }
}

const sending = ref(false)
async function record() {
  sending.value = true
  try {
    // 수정한 문안과 함께 초안 응답의 analysis_id·source 를 그대로 보낸다 (초안 없이 직접 쓴 문안은 MANUAL)
    await api(`/rmas/${rmaId.value}/communications`, {
      method: 'POST',
      body: { message_text: text.value.trim(), source: draft.value?.source ?? 'MANUAL', analysis_id: draft.value?.analysis_id ?? null },
    })
    toast({ title: '2차 회신을 기록했습니다', tone: 'green' })
    text.value = ''
    draft.value = null
    emit('changed') // 상세와 회신 이력을 다시 불러온다
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

// ---------- 처리방안 ----------
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
    await api(`/rmas/${rmaId.value}/service-action`, { method: 'POST', body: { action_type: action.value, board_qty: Number(qty.value), result, source: action.value === suggestion.value?.action_type ? 'AI_SUGGESTED' : 'MANUAL' } })
    toast({ title: result === 'EXECUTED' ? '처리를 실행했습니다. 접수가 종료됩니다' : '처리를 예약했습니다', tone: 'green' })
    emit('changed')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    acting.value = false
  }
}
const actionOptions = Object.entries(ACTION_TYPE).map(([value, label]) => ({ value, label }))
</script>

<template>
  <!-- 원인 확정 전: 잠긴 안내 -->
  <section v-if="!ready" class="flex items-center gap-3 rounded-[14px] border border-dashed bg-card p-5">
    <Lock class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0">
      <h3 class="text-[15px] font-bold">2차 회신 · 처리방안</h3>
      <p class="mt-0.5 text-xs text-muted-foreground">품질관리자가 원인을 확정하면 2차 회신 초안과 처리방안이 여기에 열립니다.</p>
    </div>
  </section>

  <div v-else class="grid gap-4">
    <section class="rounded-[14px] border-2 border-primary/25 bg-card p-5">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">2차 회신</h3>
        <Badge tone="purple">원인 확정</Badge>
        <Button size="sm" variant="outline" class="ml-auto" :loading="drafting" :disabled="closed" @click="makeDraft"><FileText class="size-3.5" />{{ draft ? '초안 다시 불러오기' : '2차 회신 초안' }}</Button>
      </header>
      <p v-if="notReady" role="alert" class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">원인 승인·확인이 끝난 뒤에 2차 회신 초안을 만들 수 있습니다.</p>
      <textarea
        v-model="text" rows="7" :disabled="closed" aria-label="2차 회신 문구" placeholder="‘2차 회신 초안’을 누르면 문안이 채워지고, 여기서 고칠 수 있습니다."
        class="mt-3 w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:bg-muted/50"
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ draft ? (edited ? '수정됨' : '초안 그대로') : '초안 없이 직접 쓸 수도 있습니다' }} · 메일은 복사해서 보내고, 보낸 사실을 기록합니다</span>
        <Button size="sm" variant="outline" class="ml-auto" :disabled="!text.trim()" @click="copy"><Copy class="size-3.5" />복사</Button>
        <Button size="sm" :loading="sending" :disabled="closed || text.trim().length < 10" @click="record"><Send class="size-3.5" />회신 기록</Button>
      </div>
    </section>

    <section class="rounded-[14px] border bg-card p-5">
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
