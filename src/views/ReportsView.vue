<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftRight, CheckCircle2, FileDown, FileText, PenLine, RefreshCw, Search, Send, Sparkles, Undo2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import PatternReportDocument from '@/components/PatternReportDocument.vue'
import ReportBody from '@/components/ReportBody.vue'
import { api, fmtDate, fmtDateTime } from '@/lib/api'
import { SEVERITY_TONE } from '@/lib/badges'
import { saveElementAsPdf } from '@/lib/pdf'
import { persistedRef } from '@/lib/persist'
import { aiState, reportLoadError, toast } from '@/lib/state'

// SCR-RPT-001 AI 분석 보고서
// 상단 전환 버튼으로 [단건 RMA] (/api/reports)와 [불량 패턴] (/api/pattern-reports) 모드를 나눈다.
const route = useRoute()
const router = useRouter()

const mode = computed(() => (route.query.mode === 'pattern' ? 'pattern' : 'rma'))

function switchMode(next) {
  if (next === mode.value) return
  if (next === 'pattern') {
    const q = { mode: 'pattern' }
    if (patternReportId.value) q.reportId = String(patternReportId.value)
    router.replace({ query: q })
  } else {
    const q = {}
    if (rmaId.value) q.rmaId = rmaId.value
    router.replace({ query: q })
  }
}

// ============================================================================
// 1. 단건 RMA 보고서 (기존 /api/reports 그대로 유지)
// ============================================================================
const history = ref(null)
const query = ref(route.query.rmaId || '')
const current = ref(null)
const missing = ref(false)
const gen = ref({ state: 'idle', progress: 0 }) // idle | running | done | failed | slow
const busy = ref(false)
const editing = ref(null)
const draft = ref(null)
const docEl = ref(null)
const pdfBusy = ref(false)

const rmaId = computed(() => (mode.value === 'rma' ? route.query.rmaId : null))

async function loadHistory() {
  const res = await api('/reports', { query: { size: 100 } }).catch(reportLoadError)
  history.value = res?.items ?? []
}

watch(
  rmaId,
  async (id) => {
    current.value = null
    missing.value = false
    editing.value = null
    draft.value = null
    gen.value = { state: 'idle', progress: 0 }
    if (!id) return
    query.value = id
    try {
      current.value = await api(`/reports/${id}`)
    } catch (e) {
      if (e.message !== '보고서가 없습니다') return reportLoadError(e)
      missing.value = true
      if (route.query.generate) {
        router.replace({ query: { rmaId: id } })
        generate()
      }
    }
  },
  { immediate: true },
)

function pick() {
  const id = query.value.trim().toUpperCase()
  if (id) router.replace({ query: { rmaId: id } })
}

async function withProgress(fn) {
  gen.value = { state: 'running', progress: 5 }
  const tick = setInterval(() => (gen.value.progress = Math.min(95, gen.value.progress + 7)), 200)
  const slow = setTimeout(() => (gen.value.state = 'slow'), 30000)
  try {
    await fn()
    gen.value = { state: 'done', progress: 100 }
  } catch (e) {
    gen.value = { state: 'failed', progress: 0 }
    toast({ title: e.status === 503 ? 'AI 일시 불가' : e.status === 404 ? 'RMA를 찾을 수 없습니다' : e.status === 409 ? e.message : '보고서 생성에 실패했습니다', tone: 'red' })
  } finally {
    clearInterval(tick)
    clearTimeout(slow)
  }
}

function generate() {
  editing.value = null
  const id = rmaId.value
  if (current.value) {
    return withProgress(async () => {
      draft.value = await api(`/reports/${id}/draft`, { method: 'POST' })
    })
  }
  return withProgress(async () => {
    current.value = await api(`/reports/${id}`, { method: 'POST' })
    missing.value = false
    toast({ title: `${id} 보고서 생성이 완료되었습니다`, tone: 'green' })
    loadHistory()
  })
}

async function run(fn) {
  busy.value = true
  try {
    await fn()
    loadHistory()
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    busy.value = false
  }
}

const review = () => run(async () => {
  const r = await api(`/reports/${current.value.rma_id}/review`, { method: 'POST' })
  current.value = { ...current.value, reviewed: true, ...r }
})

const cancelReview = () => run(async () => {
  await api(`/reports/${current.value.rma_id}/review`, { method: 'DELETE' })
  current.value = { ...current.value, reviewed: false, reviewed_by: null, reviewed_at: null }
  toast({ title: '검토 확인을 취소했습니다' })
})

function startEdit() {
  const c = current.value.content
  editing.value = { main_cause: c.main_cause, quality_recommendation: c.quality_recommendation, cs_recommendation: c.cs_recommendation }
}

const saveEdit = () => run(async () => {
  current.value = await api(`/reports/${current.value.rma_id}`, { method: 'PUT', body: editing.value })
  editing.value = null
  toast({ title: '본문을 저장했습니다. 다시 검토가 필요합니다', tone: 'green' })
})

const SECTIONS = [
  { key: 'main_cause', label: '주요 원인', get: (c) => c.main_cause },
  { key: 'similar', label: '과거 유사 사례', get: (c) => (c.similar || []).join('\n') },
  { key: 'quality_recommendation', label: '품질 개선 권고', get: (c) => c.quality_recommendation },
  { key: 'cs_recommendation', label: '고객 응대 권고', get: (c) => c.cs_recommendation },
  { key: 'evidence', label: '근거 RMA', get: (c) => (c.evidence || []).join(',') },
]
const changed = computed(() =>
  draft.value && current.value ? SECTIONS.filter((s) => s.get(draft.value.content) !== s.get(current.value.content)).map((s) => s.label) : [],
)

const keepCurrent = () => {
  draft.value = null
  gen.value = { state: 'idle', progress: 0 }
  toast({ title: '기존 보고서를 유지합니다' })
}

const useDraft = () => run(async () => {
  current.value = await api(`/reports/${current.value.rma_id}/replace`, { method: 'POST', body: { content: draft.value.content } })
  draft.value = null
  gen.value = { state: 'idle', progress: 0 }
  toast({ title: '새 초안으로 교체했습니다. 다시 검토가 필요합니다', tone: 'green' })
})

const hf = persistedRef('reports.history', { review: '', product: '', defectType: '' })
const uniq = (key) => [...new Set((history.value || []).map((h) => h[key]))].sort()
const filteredHistory = computed(() =>
  (history.value || []).filter((h) =>
    (!hf.value.review || (hf.value.review === 'done') === h.reviewed) &&
    (!hf.value.product || h.product === hf.value.product) &&
    (!hf.value.defectType || h.defect_type === hf.value.defectType),
  ),
)

// ============================================================================
// 2. 불량 패턴 보고서 (v7 /api/pattern-reports)
// ============================================================================
const patternHistory = ref(null)
const patternSearch = ref('')
const activePatternFilter = ref('')
const patternDetail = ref(null)
const patternLoading = ref(false)
const patternNotFound = ref(false)

const selectedDept = ref('')
const requestNote = ref('')
const replyDueDate = ref('')
const deliveryPreview = ref(null)
const deliveryLoading = ref(false)
const patternViewTab = ref('original') // original | delivery
const patternOrigEl = ref(null)
const patternDeliveryEl = ref(null)

const patternReportId = computed(() => (mode.value === 'pattern' && route.query.reportId ? Number(route.query.reportId) : null))

async function loadPatternHistory(patternId = activePatternFilter.value, autoSelect = false) {
  const q = { size: 100 }
  if (patternId) q.pattern_id = patternId
  const res = await api('/pattern-reports', { query: q }).catch(reportLoadError)
  const items = res?.items ?? []
  patternHistory.value = items
  if (autoSelect && items.length) {
    router.replace({ query: { mode: 'pattern', reportId: String(items[0].report_id) } })
  }
}

function searchPatternReports() {
  const pid = patternSearch.value.trim().toUpperCase()
  activePatternFilter.value = pid
  loadPatternHistory(pid, true)
}

function resetPatternSearch() {
  patternSearch.value = ''
  activePatternFilter.value = ''
  loadPatternHistory('', false)
}

let patternSeq = 0
watch(
  patternReportId,
  async (id) => {
    patternDetail.value = null
    patternNotFound.value = false
    deliveryPreview.value = null
    patternViewTab.value = 'original'
    requestNote.value = ''
    replyDueDate.value = ''
    if (!id) return
    const seq = ++patternSeq
    patternLoading.value = true
    try {
      const res = await api(`/pattern-reports/${id}`)
      if (seq !== patternSeq) return
      patternDetail.value = res
      // 추천 부서가 있으면 기본 선택
      const depts = res?.departments || []
      selectedDept.value = depts.find((d) => d.recommended)?.code || depts[0]?.code || ''
    } catch (e) {
      if (seq !== patternSeq) return
      if (e.status === 404) patternNotFound.value = true
      else reportLoadError(e)
    } finally {
      if (seq === patternSeq) patternLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  mode,
  (m) => {
    if (m === 'pattern' && patternHistory.value === null) {
      loadPatternHistory('', !patternReportId.value)
    }
  },
  { immediate: true },
)

async function loadDeliveryPreview() {
  if (!patternReportId.value || !selectedDept.value) return
  deliveryLoading.value = true
  try {
    deliveryPreview.value = await api(`/pattern-reports/${patternReportId.value}/delivery-preview`, {
      method: 'POST',
      body: {
        department: selectedDept.value,
        request_note: requestNote.value.trim() || null,
        reply_due_date: replyDueDate.value || null,
      },
    })
    patternViewTab.value = 'delivery'
  } catch (e) {
    toast({ title: e.message || '전달본 미리보기를 불러오지 못했습니다', tone: 'red' })
  } finally {
    deliveryLoading.value = false
  }
}

onMounted(() => {
  loadHistory()
  if (mode.value === 'pattern') loadPatternHistory('', !patternReportId.value)
})

// ============================================================================
// 3. PDF 다운로드 (단건 RMA / 패턴 원본 / 패턴 전달본 공용)
// ============================================================================
const canDownloadPdf = computed(() => {
  if (mode.value === 'rma') return !!current.value && !editing.value && !draft.value
  if (patternViewTab.value === 'delivery') return !!deliveryPreview.value
  return !!patternDetail.value
})

async function downloadPdf() {
  pdfBusy.value = true
  try {
    if (mode.value === 'rma') {
      await saveElementAsPdf(docEl.value, `${current.value.rma_id}_AI분석보고서.pdf`)
    } else if (patternViewTab.value === 'delivery' && deliveryPreview.value) {
      const pid = deliveryPreview.value.header?.pattern_id || patternReportId.value
      const dept = deliveryPreview.value.department?.name || selectedDept.value
      await saveElementAsPdf(patternDeliveryEl.value, `${pid}_${dept}_전달본.pdf`)
    } else if (patternDetail.value) {
      const pid = patternDetail.value.header?.pattern_id || patternReportId.value
      await saveElementAsPdf(patternOrigEl.value, `${pid}_불량패턴보고서.pdf`)
    }
  } catch {
    toast({ title: 'PDF를 만들지 못했습니다', tone: 'red' })
  } finally {
    pdfBusy.value = false
  }
}
</script>

<template>
  <PageHead :crumb="false" title="AI 분석 보고서" description="단건 RMA 보고서와 불량 패턴 종합 보고서·부서별 전달본을 조회하고 PDF로 저장합니다.">
    <template #actions>
      <span class="inline-flex overflow-hidden rounded-lg border bg-card text-xs font-semibold" role="group" aria-label="보고서 유형">
        <button
          class="px-3 py-1.5 transition-colors"
          :class="mode === 'rma' ? 'bg-[#fff1f3] text-primary' : 'text-muted-foreground hover:bg-muted/50'"
          :aria-pressed="mode === 'rma'"
          @click="switchMode('rma')"
        >
          단건 RMA
        </button>
        <button
          class="border-l px-3 py-1.5 transition-colors"
          :class="mode === 'pattern' ? 'bg-[#fff1f3] text-primary' : 'text-muted-foreground hover:bg-muted/50'"
          :aria-pressed="mode === 'pattern'"
          @click="switchMode('pattern')"
        >
          불량 패턴
        </button>
      </span>
      <Button variant="outline" :disabled="!canDownloadPdf" :loading="pdfBusy" @click="downloadPdf">
        <FileDown class="size-4" />
        {{ mode === 'pattern' && patternViewTab === 'delivery' ? '전달본 PDF' : 'PDF 다운로드' }}
      </Button>
    </template>
  </PageHead>

  <!-- ====================================================================== -->
  <!-- 모드 A: 단건 RMA 보고서 (기존 유지)                                       -->
  <!-- ====================================================================== -->
  <template v-if="mode === 'rma'">
    <Card class="mb-4">
      <label class="mb-2 block text-xs font-semibold text-muted-foreground" for="rma-q">분석 대상 RMA</label>
      <form class="flex gap-2" @submit.prevent="pick">
        <Input id="rma-q" v-model="query" placeholder="RMA ID (예: RMA-2940)" class="flex-1" />
        <Button type="submit" variant="outline"><Search class="size-4" />조회</Button>
        <Button
          v-if="rmaId"
          :disabled="!aiState.available || gen.state === 'running' || !!editing || !!draft"
          :loading="gen.state === 'running'"
          @click="generate"
        >
          <template v-if="current"><RefreshCw class="size-4" />보고서 다시 생성</template>
          <template v-else><Sparkles class="size-4" />보고서 생성</template>
        </Button>
      </form>
      <p class="mt-2 text-xs text-muted-foreground">
        보고서가 없는 RMA를 조회하면 생성할 수 있습니다. 다시 생성하면 새 초안을 기존 보고서와 나란히 비교한 뒤 교체 여부를 고릅니다.
      </p>
      <p v-if="!aiState.available" class="mt-1 text-xs text-[#c4621a]">AI 일시 불가 — 생성은 중단되며 기존 보고서 조회, 수정, 확인은 가능합니다.</p>
      <div v-if="gen.state !== 'idle'" class="mt-3 text-xs">
        <div class="mb-1 flex justify-between text-muted-foreground">
          <span>{{ { running: current ? '새 초안 생성 중' : '생성 중', done: '완료', failed: '실패', slow: '지연' }[gen.state] }}</span><span class="tabular">{{ gen.progress }}%</span>
        </div>
        <div class="h-1.5 rounded-full bg-muted"><div :class="gen.state === 'failed' ? 'bg-red-500' : 'bg-primary'" class="h-full rounded-full transition-all" :style="{ width: gen.progress + '%' }" /></div>
        <p v-if="gen.state === 'slow'" class="mt-1 text-[#c4621a]">생성이 지연되고 있습니다. 완료되면 이력에 표시됩니다.</p>
      </div>
    </Card>

    <section v-if="draft && current" class="rounded-[14px] border bg-card">
      <div class="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <ArrowLeftRight class="size-4 text-primary" />
        <h2 class="text-[16px] font-bold">{{ current.rma_id }} 보고서 비교</h2>
        <span class="text-sm text-muted-foreground">
          <template v-if="changed.length">바뀐 항목: <b class="font-semibold text-foreground">{{ changed.join(', ') }}</b></template>
          <template v-else>새 초안의 내용이 기존과 같습니다</template>
        </span>
        <span class="ml-auto flex gap-2">
          <Button variant="outline" :disabled="busy" @click="keepCurrent">기존 보고서 유지</Button>
          <Button :loading="busy" @click="useDraft"><RefreshCw class="size-4" />새 초안으로 교체</Button>
        </span>
      </div>
      <div class="grid grid-cols-1 divide-y xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        <div class="min-w-0 px-6 py-5">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm font-bold">기존 보고서</p>
            <span class="flex items-center gap-2 text-xs text-muted-foreground">
              {{ fmtDateTime(current.generated_at) }}
              <Badge v-if="current.content.edited_by" tone="purple">{{ current.content.edited_by }} 수정본</Badge>
              <Badge :tone="current.reviewed ? 'green' : 'yellow'">{{ current.reviewed ? '확인 완료' : '미확인' }}</Badge>
            </span>
          </div>
          <ReportBody :content="current.content" :changed="changed" @open-rma="(id) => router.push({ path: '/rmas', query: { open: id } })" />
        </div>
        <div class="min-w-0 bg-[#fffbfc] px-6 py-5">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm font-bold text-primary">새 초안</p>
            <span class="flex items-center gap-2 text-xs text-muted-foreground">{{ fmtDateTime(draft.generated_at) }}<Badge tone="red">저장 전</Badge></span>
          </div>
          <ReportBody :content="draft.content" :changed="changed" highlight @open-rma="(id) => router.push({ path: '/rmas', query: { open: id } })" />
        </div>
      </div>
      <p class="border-t bg-muted/50 px-6 py-3 text-xs text-muted-foreground">
        교체하면 새 초안이 저장되고 검토 상태는 <b class="font-semibold text-foreground">미확인</b>으로 돌아갑니다.
        <template v-if="current.content.edited_by"> 기존 보고서의 수정 내용({{ current.content.edited_by }})은 사라집니다.</template>
      </p>
    </section>

    <div v-else class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card title="보고서 이력" :description="history ? `${filteredHistory.length} / ${history.length}건, 미확인 우선` : ''" :padded="false" class="xl:sticky xl:top-[84px]">
        <div class="grid grid-cols-2 gap-2 px-4 pt-3">
          <Select v-model="hf.review" size="sm" class="col-span-2" placeholder="검토 상태 전체" :options="[{ value: 'todo', label: '미확인' }, { value: 'done', label: '확인 완료' }]" />
          <Select v-model="hf.product" size="sm" placeholder="전체 제품" :options="uniq('product')" />
          <Select v-model="hf.defectType" size="sm" placeholder="전체 불량 유형" :options="uniq('defect_type')" />
        </div>
        <div class="max-h-[min(600px,calc(100vh-256px))] overflow-y-auto p-2">
          <Skeleton v-if="!history" class="m-3 h-40" />
          <p v-else-if="!filteredHistory.length" class="py-10 text-center text-xs text-muted-foreground">조건에 맞는 보고서가 없습니다</p>
          <button
            v-for="h in filteredHistory"
            :key="h.rma_id"
            :class="rmaId === h.rma_id ? 'border-l-primary bg-brand-soft' : 'border-l-transparent hover:bg-muted/60'"
            class="block w-full border-l-2 px-4 py-3 text-left"
            @click="router.replace({ query: { rmaId: h.rma_id } })"
          >
            <span class="flex items-center justify-between">
              <b class="text-[14px] font-bold">{{ h.rma_id }}</b>
              <Badge :tone="h.reviewed ? 'green' : 'yellow'">{{ h.reviewed ? '확인 완료' : '미확인' }}</Badge>
            </span>
            <span class="mt-1 block text-xs text-muted-foreground">{{ h.product }} {{ h.defect_type }}</span>
            <span class="mt-0.5 block text-[12px] text-muted-foreground">분석 초안, {{ fmtDateTime(h.generated_at) }}</span>
          </button>
        </div>
      </Card>

      <section class="overflow-hidden rounded-[14px] border bg-card">
        <p v-if="!rmaId" class="py-24 text-center text-sm text-muted-foreground">위에서 RMA를 조회하거나 이력을 선택하세요</p>
        <div v-else-if="missing" class="py-24 text-center text-sm text-muted-foreground">
          <p>{{ rmaId }}의 보고서가 아직 없습니다.</p>
          <Button v-if="gen.state !== 'running'" class="mt-4" :disabled="!aiState.available" @click="generate"><Sparkles class="size-4" />보고서 생성</Button>
        </div>
        <Skeleton v-else-if="!current" class="m-8 h-96" />
        <div v-else ref="docEl" class="bg-card">
          <div class="h-1" style="background: linear-gradient(90deg, #ea002c 0%, #f47725 100%)" />
          <header class="border-b border-[#f3dfe3] px-9 pb-6 pt-7" style="background: linear-gradient(160deg, #fff1f3 0%, #fff7f1 48%, #ffffff 100%)">
            <div class="flex items-start justify-between gap-4">
              <p class="text-[13px] font-extrabold tracking-[0.8px] text-primary">E!FFECT / PCB ANALYSIS REPORT</p>
              <Badge :tone="current.reviewed ? 'green' : 'yellow'">{{ current.reviewed ? '확인 완료' : '미확인' }}</Badge>
            </div>
            <h2 class="mt-3 text-[32px] font-extrabold leading-[1.25] tracking-[-0.03em]">{{ current.product }} {{ current.defect_type }}<br />RMA 분석 보고서</h2>
            <div class="mt-2 flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-[#5f6673]">
                {{ current.rma_id }}, PCB 분석 초안<span v-if="current.content.edited_by">, {{ current.content.edited_by }} 수정 {{ current.content.edited_at.replace('T', ' ') }}</span>
                <span v-if="current.reviewed">, 검토 {{ current.reviewed_by }} {{ fmtDateTime(current.reviewed_at) }}</span>
              </p>
              <Button v-if="!editing" data-pdf-ignore variant="outline" size="sm" @click="startEdit"><PenLine class="size-3.5" />본문 수정</Button>
            </div>

            <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#f1dfe2] bg-[#f1dfe2] text-[13px] sm:grid-cols-4">
              <div class="bg-white/80 px-4 py-3"><dt class="text-muted-foreground">대상 제품</dt><dd class="mt-1 text-[15px] font-bold">{{ current.product }} / PCB</dd></div>
              <div class="bg-white/80 px-4 py-3"><dt class="text-muted-foreground">접수일</dt><dd class="mt-1 text-[15px] font-bold tabular">{{ fmtDate(current.claim_date) }}</dd></div>
              <div class="bg-white/80 px-4 py-3"><dt class="text-muted-foreground">심각도</dt><dd class="mt-1"><Badge :tone="SEVERITY_TONE[current.severity]">{{ current.severity }}</Badge></dd></div>
              <div class="bg-white/80 px-4 py-3"><dt class="text-muted-foreground">생성일</dt><dd class="mt-1 text-[15px] font-bold tabular">{{ fmtDateTime(current.generated_at) }}</dd></div>
            </dl>
          </header>

          <div class="px-9 pb-8 pt-7">
            <div v-if="editing" class="space-y-4 text-sm">
              <label class="block">
                <span class="mb-2 block text-[16px] font-bold"><span class="mr-2 text-xs font-extrabold text-primary">01</span>주요 원인 분석</span>
                <textarea v-model="editing.main_cause" rows="4" class="w-full rounded-lg border px-4 py-3 text-[16px] leading-[1.75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
              <label class="block">
                <span class="mb-2 block text-[16px] font-bold"><span class="mr-2 text-xs font-extrabold text-primary">03</span>품질 개선 권고</span>
                <textarea v-model="editing.quality_recommendation" rows="3" class="w-full rounded-lg border px-4 py-3 text-[16px] leading-[1.75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
              <label class="block">
                <span class="mb-2 block text-[16px] font-bold"><span class="mr-2 text-xs font-extrabold text-primary">03</span>고객 응대 권고</span>
                <textarea v-model="editing.cs_recommendation" rows="3" class="w-full rounded-lg border px-4 py-3 text-[16px] leading-[1.75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
              <p class="text-xs text-muted-foreground">유사 사례와 근거 RMA는 계산된 값이라 수정하지 않습니다. 저장하면 검토 확인이 초기화됩니다.</p>
              <div class="flex justify-end gap-2">
                <Button variant="outline" @click="editing = null">취소</Button>
                <Button :loading="busy" @click="saveEdit">저장</Button>
              </div>
            </div>
            <ReportBody v-else :content="current.content" @open-rma="(id) => router.push({ path: '/rmas', query: { open: id } })" />

            <div v-if="!editing" data-pdf-ignore class="mt-8 flex items-center justify-between gap-3 rounded-xl bg-muted/70 px-5 py-4 text-sm">
              <template v-if="current.reviewed">
                <span class="flex items-center gap-2 font-medium text-[#20866a]"><CheckCircle2 class="size-4" />확인 완료, {{ current.reviewed_by }}, {{ fmtDateTime(current.reviewed_at) }}</span>
                <Button variant="outline" size="sm" :loading="busy" @click="cancelReview"><Undo2 class="size-3.5" />검토 취소</Button>
              </template>
              <template v-else>
                <span class="text-muted-foreground">아직 담당자의 검토가 완료되지 않았습니다.</span>
                <Button size="sm" :loading="busy" @click="review"><CheckCircle2 class="size-3.5" />검토 완료</Button>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>
  </template>

  <!-- ====================================================================== -->
  <!-- 모드 B: 불량 패턴 보고서 (v7 /api/pattern-reports)                        -->
  <!-- ====================================================================== -->
  <template v-else>
    <Card class="mb-4">
      <label class="mb-2 block text-xs font-semibold text-muted-foreground" for="pattern-q">패턴 번호 검색</label>
      <form class="flex gap-2" @submit.prevent="searchPatternReports">
        <Input id="pattern-q" v-model="patternSearch" placeholder="패턴 번호 (예: INV-26-0021)" class="flex-1" />
        <Button type="submit" variant="outline"><Search class="size-4" />검색</Button>
        <Button v-if="activePatternFilter" type="button" variant="outline" @click="resetPatternSearch">전체 보기</Button>
      </form>
      <p class="mt-2 text-xs text-muted-foreground">
        저장된 불량 패턴 보고서를 패턴 번호로 검색하거나 이력에서 선택하세요. 새 보고서는
        <button class="font-semibold text-primary underline-offset-2 hover:underline" @click="router.push('/quality/patterns')">불량 패턴 분석</button>
        탭에서 생성할 수 있습니다.
      </p>
    </Card>

    <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <!-- 좌측 패턴 보고서 이력 -->
      <Card
        title="패턴 보고서 이력"
        :description="patternHistory ? `${patternHistory.length}건${activePatternFilter ? ` (${activePatternFilter})` : ''}` : ''"
        :padded="false"
        class="xl:sticky xl:top-[84px]"
      >
        <div class="max-h-[min(640px,calc(100vh-236px))] overflow-y-auto p-2">
          <Skeleton v-if="patternHistory === null" class="m-3 h-40" />
          <div v-else-if="!patternHistory.length" class="px-4 py-10 text-center text-xs text-muted-foreground">
            <p>{{ activePatternFilter ? `${activePatternFilter}의 저장된 보고서가 없습니다.` : '저장된 불량 패턴 보고서가 없습니다.' }}</p>
            <Button variant="outline" size="xs" class="mt-3" @click="router.push('/quality/patterns')">불량 패턴 분석에서 생성</Button>
          </div>
          <button
            v-for="h in patternHistory"
            :key="h.report_id"
            :class="patternReportId === h.report_id ? 'border-l-primary bg-brand-soft' : 'border-l-transparent hover:bg-muted/60'"
            class="block w-full border-l-2 px-4 py-3 text-left"
            @click="router.replace({ query: { mode: 'pattern', reportId: String(h.report_id) } })"
          >
            <span class="flex items-center justify-between gap-2">
              <b class="text-[13.5px] font-bold">{{ h.pattern_id }}</b>
              <Badge tone="outline">#{{ h.report_id }}</Badge>
            </span>
            <span class="mt-1 block truncate text-xs font-medium text-[#2d3440]">{{ h.title }}</span>
            <span class="mt-0.5 block text-[11.5px] text-muted-foreground">{{ fmtDate(h.from) }} ~ {{ fmtDate(h.to) }} · {{ h.product || '전체 제품' }}</span>
            <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ fmtDateTime(h.generated_at) }}</span>
          </button>
        </div>
      </Card>

      <!-- 우측 패턴 보고서 상세 + 부서 전달본 미리보기 -->
      <div class="min-w-0 space-y-4">
        <!-- 부서 선택 → 전달본 미리보기 컨트롤 패널 -->
        <Card v-if="patternDetail" title="부서별 전달본 미리보기" description="부서를 선택하고 QA 요청 사항·회신 기한을 입력해 전달용 PDF를 미리 볼 수 있습니다.">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[200px_165px_minmax(0,1fr)]">
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="dept-select">전달 대상 부서</label>
              <select
                id="dept-select"
                v-model="selectedDept"
                class="h-9 w-full rounded-lg border bg-card px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option v-for="d in patternDetail.departments || []" :key="d.code" :value="d.code">
                  {{ d.name }}{{ d.recommended ? ' (추천)' : '' }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="due-date">회신 기한 (선택)</label>
              <input
                id="due-date"
                v-model="replyDueDate"
                type="date"
                class="h-9 w-full rounded-lg border bg-card px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-muted-foreground" for="req-note">QA 요청 사항 (선택 · 최대 2,000자)</label>
              <input
                id="req-note"
                v-model="requestNote"
                maxlength="2000"
                placeholder="비워 두면 부서별 기본 요청 문구가 들어갑니다"
                class="h-9 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div class="inline-flex overflow-hidden rounded-lg border text-xs font-semibold">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5"
                :class="patternViewTab === 'original' ? 'bg-[#fff1f3] text-primary' : 'bg-white text-muted-foreground hover:bg-muted/40'"
                @click="patternViewTab = 'original'"
              >
                <FileText class="size-3.5" />원본 보고서 (부록 포함)
              </button>
              <button
                :disabled="!deliveryPreview"
                class="flex items-center gap-1.5 border-l px-3 py-1.5 disabled:opacity-45"
                :class="patternViewTab === 'delivery' ? 'bg-[#fff1f3] text-primary' : 'bg-white text-muted-foreground hover:bg-muted/40'"
                @click="patternViewTab = 'delivery'"
              >
                <Send class="size-3.5" />전달본 미리보기{{ deliveryPreview?.department?.name ? ` (${deliveryPreview.department.name})` : '' }}
              </button>
            </div>

            <Button size="sm" :disabled="!selectedDept" :loading="deliveryLoading" @click="loadDeliveryPreview">
              <Send class="size-3.5" />전달본 미리보기 생성
            </Button>
          </div>
        </Card>

        <!-- 본문 영역 -->
        <section class="overflow-hidden rounded-[14px] border bg-card">
          <p v-if="!patternReportId" class="py-24 text-center text-sm text-muted-foreground">
            왼쪽 이력에서 불량 패턴 보고서를 선택하거나 위에서 패턴 번호를 검색하세요
          </p>
          <div v-else-if="patternNotFound" class="py-24 text-center text-sm text-muted-foreground">
            <p>요청한 패턴 보고서(#{{ patternReportId }})를 찾을 수 없습니다.</p>
          </div>
          <Skeleton v-else-if="patternLoading || !patternDetail" class="m-8 h-96" />
          <template v-else>
            <div v-show="patternViewTab === 'original'" ref="patternOrigEl">
              <PatternReportDocument
                :detail="patternDetail"
                @open-rma="(id) => router.push({ path: '/rmas', query: { open: id } })"
              />
            </div>
            <div v-if="deliveryPreview" v-show="patternViewTab === 'delivery'" ref="patternDeliveryEl">
              <PatternReportDocument
                :delivery="deliveryPreview"
                @open-rma="(id) => router.push({ path: '/rmas', query: { open: id } })"
              />
            </div>
          </template>
        </section>
      </div>
    </div>
  </template>
</template>
