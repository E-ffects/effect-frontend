<script setup>
import { computed, reactive, ref } from 'vue'
import { Download, FileText, Pencil } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { api, fmtDate, saveFile } from '@/lib/api'
import { auth, toast } from '@/lib/state'
import { LEVEL_TONE } from '@/lib/caseLabels'

// 케이스의 INPUT: 접수 폼 값 + 고객 원문(분류 근거 강조) + 첨부 + 분류·QA 판정
const props = defineProps({ rma: Object, stages: Object, attachments: Array })
const emit = defineEmits(['changed'])
const quality = computed(() => auth.user?.role === 'QUALITY')
const item = computed(() => props.rma.items?.[0] || {})
const triage = computed(() => props.rma.triage || props.rma.triage_proposal)

// 원문에서 분류 근거 문장을 찾아 강조한다
const rawParts = computed(() => {
  const text = props.rma.raw_text || ''
  const spans = (props.rma.symptom?.evidence_spans || []).map((s) => s.trim()).filter((s) => s && text.includes(s))
  if (!spans.length) return [{ t: text }]
  const re = new RegExp(`(${spans.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return text.split(re).filter(Boolean).map((t) => ({ t, hit: spans.includes(t) }))
})

// 첨부 내려받기 (GET /api/attachments/{id}: 공통 응답이 아닌 파일 본문)
const downloading = ref(null)
async function download(a) {
  downloading.value = a.attachment_id
  try {
    const res = await api(`/attachments/${a.attachment_id}`, { raw: true })
    saveFile(res instanceof Blob ? res : await res.blob(), a.file_name)
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    downloading.value = null
  }
}

const editing = ref(false)
const saving = ref(false)
const draft = reactive({ severity: 0, analysis_level: 'L2', characteristic_symbol: '', rationale: '' })
function startEdit() {
  Object.assign(draft, { severity: triage.value?.severity ?? 5, analysis_level: triage.value?.analysis_level || 'L2', characteristic_symbol: triage.value?.characteristic_symbol || '', rationale: '' })
  editing.value = true
}
async function saveTriage() {
  saving.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/triage`, {
      method: 'PUT',
      body: { severity: Number(draft.severity), analysis_level: draft.analysis_level, characteristic_symbol: draft.characteristic_symbol || null, rationale: draft.rationale },
    })
    toast({ title: 'QA 판정을 저장했습니다', tone: 'green' })
    editing.value = false
    emit('changed')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`)
const dt = 'text-muted-foreground'
</script>

<template>
  <div class="grid gap-4">
    <section class="rounded-[14px] border bg-card p-5">
      <h3 class="text-[15px] font-bold">접수 정보</h3>
      <dl class="mt-3 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt :class="dt">고객사</dt><dd>{{ rma.customer?.customer_name }}</dd>
        <dt :class="dt">제품 P/N</dt><dd class="tabular">{{ rma.reported_part_no }}</dd>
        <dt :class="dt">Lot · D/C</dt><dd class="tabular">{{ rma.reported_lot_no || '미기재' }} · {{ rma.reported_date_code || '미기재' }}</dd>
        <dt :class="dt">수량</dt><dd class="tabular">불량 {{ item.claimed_defect_qty?.toLocaleString() }} / 투입 {{ item.input_qty?.toLocaleString() }}</dd>
        <dt :class="dt">발견 단계</dt><dd>{{ stages?.[rma.detection_stage] || rma.detection_stage }}</dd>
        <dt :class="dt">발생 · 접수</dt><dd class="tabular">{{ fmtDate(rma.occurred_at) }} · {{ fmtDate(rma.opened_at) }}</dd>
        <template v-if="rma.customer_request"><dt :class="dt">고객 요청</dt><dd>{{ rma.customer_request }}</dd></template>
      </dl>
    </section>

    <section class="rounded-[14px] border bg-card p-5">
      <div class="flex items-center justify-between">
        <h3 class="text-[15px] font-bold">고객 원문</h3>
        <span v-if="rma.symptom?.evidence_spans?.length" class="text-xs text-muted-foreground"><mark class="rounded bg-[#fff1c7] px-1 text-foreground">강조</mark> = 분류 근거</span>
      </div>
      <p class="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
        <template v-for="(p, i) in rawParts" :key="i"><mark v-if="p.hit" class="rounded bg-[#fff1c7] px-0.5 text-foreground">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template>
      </p>
      <ul v-if="attachments?.length" class="mt-3 grid gap-1.5 border-t pt-3">
        <li v-for="a in attachments" :key="a.attachment_id" class="flex items-center gap-2 text-xs">
          <FileText class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate font-medium">{{ a.file_name }}</span>
          <Badge :tone="a.kind === 'RAW' ? 'blue' : 'gray'">{{ a.kind === 'RAW' ? '원문' : '첨부' }}</Badge>
          <span class="ml-auto text-muted-foreground tabular">{{ kb(a.size) }}</span>
          <button
            type="button" :disabled="downloading === a.attachment_id" :aria-label="`${a.file_name} 내려받기`"
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            @click="download(a)"
          ><Download class="size-3.5" /></button>
        </li>
      </ul>
    </section>

    <section class="rounded-[14px] border bg-card p-5">
      <h3 class="text-[15px] font-bold">증상 분류 · QA 판정</h3>
      <dl class="mt-3 grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
        <dt :class="dt">증상</dt>
        <dd v-if="rma.symptom?.minor_name">{{ rma.symptom.major_name }} › <b class="font-semibold">{{ rma.symptom.minor_name }}</b> <span class="text-xs text-muted-foreground tabular">{{ rma.symptom.primary_label }}</span></dd>
        <dd v-else><Badge tone="orange">증상 확인 불가</Badge></dd>
        <template v-if="triage">
          <dt :class="dt">분석 수준</dt>
          <dd class="flex flex-wrap items-center gap-1.5">
            <Badge :tone="LEVEL_TONE[triage.analysis_level]">{{ triage.analysis_level }}</Badge>
            <template v-if="quality">
              <span class="text-xs tabular">심각도 {{ triage.severity }}</span>
              <Badge v-if="triage.provisional" tone="yellow">임시 판정</Badge>
              <Badge v-else :tone="triage.decided_by === 'QA_AGENT' ? 'blue' : 'gray'">{{ triage.decided_by === 'QA_AGENT' ? 'AI 자동 판정' : triage.decided_by }}</Badge>
            </template>
          </dd>
          <template v-if="quality && triage.rationale"><dt :class="dt">판정 근거</dt><dd class="text-xs leading-relaxed">{{ triage.rationale }}</dd></template>
        </template>
      </dl>

      <template v-if="quality && triage && rma.approval_status !== 'APPROVED' && rma.approval_status !== 'CONFIRMED'">
        <div v-if="!editing" class="mt-3 flex items-center gap-2 border-t pt-3">
          <p class="text-xs text-muted-foreground">{{ triage.provisional ? '임시 판정입니다. 확인해야 원인분석이 시작됩니다.' : '원인 판정 전까지 수정할 수 있습니다.' }}</p>
          <Button size="sm" :variant="triage.provisional ? 'default' : 'outline'" class="ml-auto" @click="startEdit"><Pencil class="size-3.5" />{{ triage.provisional ? '판정 확인' : '판정 수정' }}</Button>
        </div>
        <form v-else class="mt-3 grid gap-2.5 border-t pt-3" @submit.prevent="saveTriage">
          <div class="grid grid-cols-3 gap-2">
            <label class="grid gap-1 text-xs font-semibold">분석 수준<Select v-model="draft.analysis_level" :options="['L1', 'L2', 'L3']" size="sm" class="w-full" /></label>
            <label class="grid gap-1 text-xs font-semibold">심각도<input v-model="draft.severity" type="number" min="1" max="10" class="h-8 rounded-md border bg-card px-2 text-xs tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></label>
            <label class="grid gap-1 text-xs font-semibold">특별특성<Select v-model="draft.characteristic_symbol" :options="[{ value: '', label: '없음' }, 'CC', 'SC']" size="sm" class="w-full" /></label>
          </div>
          <label class="grid gap-1 text-xs font-semibold">사유 <span class="font-normal text-muted-foreground">등급을 낮출 때는 10자 이상</span>
            <textarea v-model="draft.rationale" rows="2" required class="resize-y rounded-md border bg-card px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          </label>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="ghost" @click="editing = false">취소</Button>
            <Button size="sm" type="submit" :loading="saving">저장</Button>
          </div>
        </form>
      </template>
    </section>
  </div>
</template>
