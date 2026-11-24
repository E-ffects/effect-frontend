<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, RefreshCw } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import SubmitButton from '@/components/ui/SubmitButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AgentProgress from '@/components/case/AgentProgress.vue'
import CaseInput from '@/components/case/CaseInput.vue'
import CaseOutput from '@/components/case/CaseOutput.vue'
import CauseDecision from '@/components/case/CauseDecision.vue'
import CsReply from '@/components/case/CsReply.vue'
import CsSimilar from '@/components/case/CsSimilar.vue'
import { api, MOCK } from '@/lib/api'
import { auth, toast } from '@/lib/state'
import { ANALYSIS_STATE, APPROVAL, CS_STATUS, INTAKE_STATE, LEVEL_TONE, pick } from '@/lib/caseLabels'

// 케이스 화면: 왼쪽 = 넣은 것(접수 폼·고객 원문·분류·QA 판정), 오른쪽 = 에이전트가 만든 것(병목 1~4 산출물)과 사람의 판단
const route = useRoute()
const rmaId = computed(() => route.params.rmaId)
const quality = computed(() => auth.user?.role === 'QUALITY')

const rma = ref(null)
const analysis = ref(null)
const attachments = ref([])
const stages = ref({})
const error = ref('')
let timer = null

const running = computed(() => ['QUEUED', 'RUNNING'].includes(analysis.value?.analysis_state))
const finished = computed(() => ['SUCCEEDED', 'PARTIAL'].includes(analysis.value?.analysis_state))

async function loadDetail() {
  const d = await api(`/rmas/${rmaId.value}`)
  // 임시 QA 판정(TRIAGE_REVIEW): 상세 응답에 판정안(triage_proposal)이 없으면 임시 판정 목록에서 가져온다
  if (quality.value && d.intake_state === 'TRIAGE_REVIEW' && !d.triage && !d.triage_proposal) {
    try {
      const list = await api('/triage-reviews', { query: { page: 1, size: 100 } })
      const p = list.items.find((x) => x.rma_id === d.rma_id)?.proposal
      if (p) d.triage_proposal = { ...p, provisional: true, decided_by: 'QA_AGENT' }
    } catch {
      /* 목록을 못 가져와도 상세는 보여 준다 */
    }
  }
  rma.value = d
}
async function loadAnalysis() {
  const before = analysis.value?.analysis_state
  analysis.value = await api(`/rmas/${rmaId.value}/analysis`)
  if (running.value) timer = setTimeout(poll, 1000)
  else if (before && before !== analysis.value.analysis_state) await loadDetail() // 완료되면 판정 상태 갱신
}
async function poll() {
  try {
    await loadAnalysis()
  } catch {
    timer = setTimeout(poll, 3000)
  }
}

async function loadAll() {
  clearTimeout(timer)
  error.value = ''
  try {
    const [, , att, meta] = await Promise.all([loadDetail(), loadAnalysis(), api(`/rmas/${rmaId.value}/attachments`), api('/meta')])
    attachments.value = att.items
    stages.value = Object.fromEntries(meta.detection_stages.map((s) => [s.code, s.label]))
  } catch (e) {
    error.value = e.message
  }
}
onMounted(loadAll)
watch(rmaId, loadAll)
onBeforeUnmount(() => clearTimeout(timer))

async function refresh() {
  clearTimeout(timer)
  await loadDetail()
  await loadAnalysis()
}

const reanalyzing = ref(false)
// 기존 사례 분석 실행 버튼: 요청만 보내고(원으로 접혀 돈다), 완료 모습 뒤에 진행 상태를 불러온다
async function requestAnalysis() {
  try {
    await api(`/rmas/${rmaId.value}/analysis`, { method: 'POST', body: { mode: 'B', top_k: 3 } })
    return true
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
    return false
  }
}
async function reanalyze() {
  reanalyzing.value = true
  try {
    await api(`/rmas/${rmaId.value}/analysis`, { method: 'POST', body: { mode: 'B', top_k: 3 } })
    await refresh()
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    reanalyzing.value = false
  }
}

// 접수 처리 실패(AI 장애 등) → 분류부터 다시 처리 (POST /api/rmas/{id}/intake/retry, CS·QUALITY)
const retrying = ref(false)
async function retryIntake() {
  retrying.value = true
  try {
    await api(`/rmas/${rmaId.value}/intake/retry`, { method: 'POST' })
    toast({ title: '접수를 다시 처리했습니다' })
    await refresh()
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    retrying.value = false
  }
}

const level = computed(() => rma.value?.triage?.analysis_level)
const csResult = computed(() => analysis.value?.result)
</script>

<template>
  <p v-if="error" role="alert" class="rounded-[14px] border bg-card p-6 text-sm text-destructive">{{ error }}</p>
  <div v-else-if="!rma" class="grid gap-4">
    <Skeleton class="h-24 rounded-[14px]" />
    <Skeleton class="h-28 rounded-[14px]" />
    <div class="grid grid-cols-12 gap-4"><Skeleton class="col-span-4 h-[520px] rounded-[14px]" /><Skeleton class="col-span-8 h-[520px] rounded-[14px]" /></div>
  </div>

  <template v-else>
    <!-- 머리말 -->
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] tabular">{{ rma.rma_id }}</h1>
          <Badge v-if="level" :tone="LEVEL_TONE[level]">{{ level }}</Badge>
          <Badge :tone="pick(INTAKE_STATE, rma.intake_state).tone">{{ pick(INTAKE_STATE, rma.intake_state).label }}</Badge>
          <Badge :tone="pick(CS_STATUS, rma.cs_status).tone">고객 {{ pick(CS_STATUS, rma.cs_status).label }}</Badge>
          <Badge v-if="quality && rma.approval_status" :tone="pick(APPROVAL, rma.approval_status).tone">원인 {{ pick(APPROVAL, rma.approval_status).label }}</Badge>
          <Badge v-if="MOCK" tone="orange">목업 데이터</Badge>
        </div>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ rma.customer?.customer_name }} · {{ rma.reported_part_no }}<template v-if="rma.reported_lot_no"> · Lot {{ rma.reported_lot_no }}</template>
          <template v-if="rma.symptom?.minor_name"> · {{ rma.symptom.minor_name }}</template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="quality && rma.approval_status === 'REJECTED'" variant="outline" size="sm" :loading="reanalyzing" @click="reanalyze"><RefreshCw class="size-3.5" />재분석</Button>
        <Button variant="ghost" size="sm" @click="refresh"><RefreshCw class="size-3.5" />새로고침</Button>
      </div>
    </div>

    <!-- 에이전트 진행 -->
    <section class="mb-4 rounded-[14px] border bg-card px-5 py-4">
      <div class="mb-3 flex items-center gap-2">
        <h2 class="text-[15px] font-bold">에이전트 진행</h2>
        <Badge :tone="pick(ANALYSIS_STATE, analysis?.analysis_state).tone">{{ pick(ANALYSIS_STATE, analysis?.analysis_state).label }}</Badge>
        <span v-if="analysis?.as_of" class="ml-auto text-xs text-muted-foreground tabular">기준 시각 {{ analysis.as_of.slice(0, 16).replace('T', ' ') }}</span>
      </div>
      <AgentProgress v-if="analysis?.analysis_state !== 'NOT_REQUESTED'" :analysis="analysis" />
      <p v-else-if="rma.intake_state === 'NEEDS_INFO'" class="text-sm text-muted-foreground">원문으로 증상을 확인할 수 없어 분석을 시작하지 않았습니다. 고객 재질의 후 다시 처리합니다.</p>
      <div v-else-if="rma.intake_state === 'FAILED'" role="alert" class="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangle class="size-4 shrink-0 text-destructive" />
        <p class="min-w-0 flex-1 text-sm">접수는 저장됐지만 자동 처리가 멈췄습니다. <span class="text-muted-foreground">{{ rma.error?.detail || 'AI 서버 응답이 없습니다' }}</span></p>
        <Button size="sm" :loading="retrying" @click="retryIntake"><RefreshCw class="size-3.5" />다시 처리</Button>
      </div>
      <p v-else-if="rma.intake_state === 'TRIAGE_REVIEW'" class="text-sm text-muted-foreground">QA 임시 판정을 품질관리자가 확인하면 원인분석이 시작됩니다.</p>
      <!-- 기존 사례(v5 원본)는 분석 이력이 없다. QA 판정이 있으면 품질관리자가 바로 분석을 돌릴 수 있다 (POST .../analysis) -->
      <div v-else class="flex flex-wrap items-center gap-3">
        <p class="text-sm text-muted-foreground">이 건은 아직 에이전트 분석을 하지 않았습니다.<template v-if="!quality"> 품질관리자가 분석을 실행하면 결과가 보입니다.</template></p>
        <SubmitButton v-if="quality && rma.triage" size="sm" :action="requestAnalysis" success-label="분석 시작" @done="refresh"><RefreshCw class="size-3.5" />에이전트 분석 실행</SubmitButton>
      </div>
      <p v-if="analysis?.analysis_state === 'PARTIAL'" class="mt-3 flex items-center gap-1.5 text-xs text-[#a8711a]"><AlertTriangle class="size-3.5" />문장 생성이 일부 빠졌습니다. 원인 순위와 근거는 정상입니다.</p>
      <p v-if="analysis?.analysis_state === 'FAILED'" class="mt-3 text-xs text-destructive">분석에 실패했습니다: {{ analysis.error?.detail || '잠시 후 다시 시도하세요' }}</p>
    </section>

    <div class="grid grid-cols-12 items-start gap-4">
      <!-- 넣은 것 -->
      <div class="col-span-12 lg:col-span-4">
        <h2 class="mb-2.5 text-[17px] font-bold">입력</h2>
        <CaseInput :rma="rma" :stages="stages" :attachments="attachments" @changed="refresh" />
      </div>

      <!-- 나온 것 -->
      <div class="col-span-12 lg:col-span-8">
        <h2 class="mb-2.5 text-[17px] font-bold">결과</h2>
        <!-- 품질관리자: 병목 1~4 산출물 + 원인 판정 -->
        <template v-if="quality">
          <div v-if="running" class="grid gap-4"><Skeleton class="h-64 rounded-[14px]" /><Skeleton class="h-48 rounded-[14px]" /></div>
          <div v-else-if="finished" class="grid gap-4">
            <CauseDecision :rma-id="rma.rma_id" :analysis="analysis" :level="level" :approval-status="rma.approval_status" @decided="refresh" />
            <CaseOutput :result="analysis.result" :trace="analysis.trace" />
          </div>
          <p v-else class="rounded-[14px] border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">분석이 끝나면 원인 후보, Lot 이력, 영향 후보 Lot, 재발 판정이 여기에 나옵니다.</p>
        </template>

        <!-- 고객대응관리자: 회신·처리방안 -->
        <template v-else>
          <div v-if="running" class="grid gap-4"><Skeleton class="h-72 rounded-[14px]" /></div>
          <div v-else-if="finished || rma.intake_state === 'NEEDS_INFO'" class="grid gap-4">
            <section v-if="finished" class="rounded-[14px] border bg-card p-5">
              <h3 class="text-[15px] font-bold">분석 요약</h3>
              <dl class="mt-3 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt class="text-muted-foreground">증상</dt><dd>{{ csResult?.classification?.minor_name }}</dd>
                <dt class="text-muted-foreground">분석 수준</dt><dd><Badge :tone="LEVEL_TONE[csResult?.qa_review?.analysis_level]">{{ csResult?.qa_review?.analysis_level }}</Badge> <span v-if="csResult?.qa_review?.needs_approval" class="text-xs text-muted-foreground">품질관리자 승인 후 원인 확정</span></dd>
              </dl>
            </section>
            <CsReply :rma="rma" :analysis="analysis" @changed="refresh" />
            <CsSimilar v-if="finished" :rma-id="rma.rma_id" />
          </div>
          <p v-else class="rounded-[14px] border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">분석이 끝나면 고객 회신 초안과 처리방안 제안이 여기에 나옵니다.</p>
        </template>
      </div>
    </div>
  </template>
</template>
