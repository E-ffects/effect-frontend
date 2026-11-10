<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { FileText, Search, Sparkles } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QtyProgress from './QtyProgress.vue'
import RecordPanel from './RecordPanel.vue'
import Section from './Section.vue'
import Timeline from './Timeline.vue'
import { useRmaDetail } from './useRmaDetail'
import { api, fmtDate, fmtDateTime, fmtWon } from '@/lib/api'
import { RESULT_TONE, SEVERITY_TONE, STATUS_TONE } from '@/lib/badges'
import { aiState, reportRoute, toast } from '@/lib/state'

// SCR-RMA-002 품질관리자 펼침 영역 (A 진행 중 / B 처리완료)
const props = defineProps({ rmaId: String })
const emit = defineEmits(['changed'])
const router = useRouter()
const { rma, error, similar, similarState, assist, assistError, init, loadDetail, loadSimilar } = useRmaDetail(props.rmaId)
const decision = ref('')
const deciding = ref(false)

onMounted(async () => {
  await init()
})

async function confirmDecision() {
  deciding.value = true
  try {
    await api(`/rmas/${props.rmaId}/recurrence`, { method: 'POST', body: { decision: decision.value } })
    toast({ title: `재발여부를 '${decision.value}'(으)로 확정했습니다`, tone: 'green' })
    await loadDetail()
    emit('changed')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    deciding.value = false
  }
}

async function onSaved() {
  const wasCompleted = rma.value.completed
  await loadDetail()
  if (!wasCompleted && rma.value.completed) similarState.value = 'idle' // B 구성으로 전환
  emit('changed')
}

const openRma = (id) => router.push({ path: '/rmas', query: { open: id } })
</script>

<template>
  <div class="bg-muted/40 p-4">
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <div v-else-if="!rma" class="grid grid-cols-3 gap-3"><Skeleton class="h-56" /><Skeleton class="h-56" /><Skeleton class="h-56" /></div>
    <template v-else>
      <div class="mb-3 flex items-center gap-2">
        <span class="text-base font-semibold">{{ rma.rma_id }}</span>
        <Badge :tone="SEVERITY_TONE[rma.severity]">{{ rma.severity }}</Badge>
        <Badge :tone="STATUS_TONE[rma.claim_status]">{{ rma.claim_status }}</Badge>
        <span class="text-xs text-muted-foreground">{{ rma.completed ? 'B 처리완료' : 'A 진행 중' }}</span>
        <template v-if="rma.report.exists">
          <Badge class="ml-auto" :tone="rma.report.reviewed ? 'green' : 'yellow'">보고서 {{ rma.report.reviewed ? '확인 완료' : '미확인' }}</Badge>
          <Button variant="outline" size="sm" @click="router.push(reportRoute(rma.rma_id, false))"><FileText class="size-3.5" />보고서 보기</Button>
        </template>
        <Button v-else size="sm" class="ml-auto" :disabled="!aiState.available" @click="router.push(reportRoute(rma.rma_id))"><Sparkles class="size-3.5" />보고서 생성</Button>
      </div>

      <div class="grid grid-cols-12 gap-3">
        <Section no="1" title="반품 기본 정보" class="col-span-4">
          <dl class="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt class="text-muted-foreground">제품</dt><dd>{{ rma.product }} {{ rma.product_name }} <Badge tone="outline">중요도 {{ rma.importance }}</Badge></dd>
            <dt class="text-muted-foreground">접수 채널</dt><dd>{{ rma.claim_channel }}</dd>
            <dt class="text-muted-foreground">설비 / 공정</dt><dd>{{ rma.equipment_id ? `${rma.equipment_id} / ${rma.process_id}` : '제조 이력 미확인' }}</dd>
            <template v-if="rma.serial_numbers?.length"><dt class="text-muted-foreground">시리얼</dt><dd class="font-mono text-[13px]" :title="rma.serial_numbers.join(', ')">{{ rma.serial_numbers.slice(0, 3).join(', ') }}<span v-if="rma.serial_numbers.length > 3" class="font-sans text-xs text-muted-foreground"> 외 {{ rma.serial_numbers.length - 3 }}개</span></dd></template>
            <dt class="text-muted-foreground">LOT</dt><dd>{{ rma.lot_number || (rma.serial_numbers?.length ? '시리얼 조회 전' : '미확인') }}</dd>
            <dt class="text-muted-foreground">불량 유형</dt>
            <dd class="font-medium">{{ rma.defect_type }}<template v-if="rma.defect_subtype">&nbsp;<span class="text-[#c4c8cf]">/</span> {{ rma.defect_subtype }}</template> <Badge v-if="rma.subtype_source" :tone="rma.classification_status === '분류 완료' ? 'blue' : rma.classification_status === '정보 부족' || rma.classification_status === '미분류' ? 'gray' : 'yellow'" :title="rma.classification_reason || '접수 후 상세 설명으로 자동 분류한 결과'">{{ rma.classification_status }}</Badge></dd>
            <template v-if="rma.subtype_candidates?.length"><dt class="text-muted-foreground">소분류 후보</dt><dd>{{ rma.subtype_candidates.join(', ') }}</dd></template>
            <template v-if="rma.subtype_source"><dt class="text-muted-foreground">고객 신고 내용</dt><dd class="leading-relaxed">{{ rma.symptom }}</dd></template>
            <dt class="text-muted-foreground">수량</dt><dd><QtyProgress :claim="rma.claim_qty" :inspected="rma.inspected_qty" :defect="rma.defect_qty" /></dd>
            <dt class="text-muted-foreground">검출 단계</dt><dd>{{ rma.detection_stage }}</dd>
            <dt class="text-muted-foreground">발생 / 접수일</dt><dd class="tabular">{{ fmtDate(rma.occurrence_date) }} / {{ fmtDate(rma.claim_date) }}</dd>
            <dt class="text-muted-foreground">주요 원인</dt>
            <dd v-if="rma.root_cause">{{ rma.root_cause }} <Badge :tone="rma.root_cause_confirmed ? 'green' : 'blue'">{{ rma.root_cause_confirmed ? '확정' : 'AI 추정' }}</Badge></dd>
            <dd v-else class="text-muted-foreground">미확정 <span class="text-xs">(AI 보고서에서 유사 사례 기반 추정 확인)</span></dd>
            <dt class="text-muted-foreground">심각도 근거</dt><dd class="text-xs">{{ rma.severity_basis || '-' }}</dd>
            <dt class="text-muted-foreground">손실 금액</dt><dd class="tabular">{{ rma.financial_impact_krw != null ? fmtWon(rma.financial_impact_krw) : '정산 대기' }}</dd>
          </dl>
        </Section>

        <Section no="2" title="처리 및 대응 현황" class="col-span-4">
          <div class="max-h-[330px] overflow-y-auto pr-1"><Timeline :events="rma.timeline" :completed="rma.completed" :status="rma.claim_status" /></div>
        </Section>

        <div class="col-span-4 space-y-3">
          <Section no="3" title="재발여부 확정">
            <template v-if="rma.recurrence_decision">
              <p class="text-sm">확정: <Badge :tone="rma.recurrence_decision === '신규' ? 'gray' : 'red'">{{ rma.recurrence_decision }}</Badge></p>
              <p class="mt-1 text-xs text-muted-foreground">{{ rma.decided_by }}, {{ fmtDateTime(rma.decided_at) }}</p>
            </template>
            <template v-else>
              <p v-if="assistError" class="mb-2 text-xs text-amber-700">AI 제안: {{ assistError }}</p>
              <div v-else-if="assist" class="mb-3 rounded-md bg-muted/60 p-2.5 text-xs">
                <p>AI 제안 <Badge :tone="assist.suggestion === '신규' ? 'gray' : 'purple'">{{ assist.suggestion }}</Badge></p>
                <p class="mt-1 text-muted-foreground">{{ assist.basis }}</p>
              </div>
              <Skeleton v-else class="mb-3 h-12" />
              <div v-if="!rma.completed" class="flex items-center gap-2">
                <div class="flex flex-1 gap-1">
                  <label v-for="d in ['재발', '확산형 재발', '신규']" :key="d" :class="decision === d ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'" class="flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-center text-xs">
                    <input v-model="decision" type="radio" :value="d" class="sr-only" />{{ d }}
                  </label>
                </div>
                <Button size="sm" :disabled="!decision" :loading="deciding" @click="confirmDecision">확정</Button>
              </div>
              <p v-else class="text-xs text-muted-foreground">미확정 (처리완료 건은 읽기 전용)</p>
            </template>
          </Section>
          <Section no="4" title="처리 방법 및 결과 기록">
            <RecordPanel :rma="rma" view="quality" @saved="onSaved" />
          </Section>
        </div>

        <Section no="5" title="과거 유사 사례 비교 (Top 5)" note="접수일 이전, 유사도 0.7 이상" class="col-span-12">
          <template v-if="rma.completed && similarState === 'idle'" #actions>
            <Button size="sm" variant="outline" @click="loadSimilar"><Search class="size-3.5" />유사 사례 검색</Button>
          </template>
          <p v-if="rma.completed && similarState === 'idle'" class="text-sm text-muted-foreground">처리완료 건은 유사 사례를 기본으로 표시하지 않습니다. [유사 사례 검색]을 누르면 검색합니다.</p>
          <div v-else-if="similarState === 'loading'" class="grid grid-cols-5 gap-3"><Skeleton v-for="i in 5" :key="i" class="h-40" /></div>
          <p v-else-if="similarState === 'error'" class="text-sm text-amber-700">유사 사례를 불러오지 못했습니다.</p>
          <p v-else-if="!similar?.items.length" class="text-sm text-muted-foreground">유사도 0.7 이상인 과거 사례가 없습니다</p>
          <div v-else class="grid grid-cols-5 gap-3">
            <div v-for="s in similar.items" :key="s.rma_id" class="rounded-md border p-3 text-xs">
              <div class="flex items-center justify-between">
                <button class="font-semibold underline underline-offset-2" @click="openRma(s.rma_id)">{{ s.rma_id }}</button>
                <span class="tabular font-semibold">{{ s.similarity.toFixed(2) }}</span>
              </div>
              <div class="mt-1 h-1 rounded-full bg-muted"><div class="h-1 rounded-full bg-sk-red" :style="{ width: s.similarity * 100 + '%' }" /></div>
              <dl class="mt-2 space-y-1">
                <div><dt class="inline text-muted-foreground">판단 근거 </dt><dd class="inline">{{ s.basis }}</dd></div>
                <div><dt class="inline text-muted-foreground">과거 조치 </dt><dd class="inline">{{ s.past_action }}</dd></div>
                <div class="flex items-center gap-1"><dt class="text-muted-foreground">결과</dt><dd><Badge :tone="RESULT_TONE[s.result]">{{ s.result }}</Badge></dd></div>
                <div class="flex items-center gap-1"><dt class="text-muted-foreground">재발</dt><dd><Badge :tone="s.recurrence ? 'purple' : 'gray'">{{ s.recurrence ? '있음' : '없음' }}</Badge></dd></div>
                <div><dt class="inline text-muted-foreground">해결 소요 </dt><dd class="inline tabular">{{ s.days_to_resolve }}일</dd></div>
              </dl>
            </div>
          </div>
        </Section>
      </div>
    </template>
  </div>
</template>
