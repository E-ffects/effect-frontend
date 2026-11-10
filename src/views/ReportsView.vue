<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftRight, CheckCircle2, FileDown, PenLine, RefreshCw, Search, Sparkles, Undo2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import ReportBody from '@/components/ReportBody.vue'
import { api, fmtDate, fmtDateTime } from '@/lib/api'
import { SEVERITY_TONE } from '@/lib/badges'
import { saveElementAsPdf } from '@/lib/pdf'
import { persistedRef } from '@/lib/persist'
import { aiState, reportLoadError, toast } from '@/lib/state'

// SCR-RPT-001 AI 분석 보고서 — 조회·생성·본문 수정·검토 확인/취소·PDF 저장은 이 화면에서 한다.
// 다른 화면의 [보고서 생성]은 ?rmaId=…&generate=1 로 이동해 보고서가 없으면 바로 생성한다.
// 이미 있는 보고서를 다시 생성하면 새 초안을 저장하지 않고 기존 보고서와 나란히 비교한 뒤 교체 여부를 고른다.
const route = useRoute()
const router = useRouter()
const history = ref(null)
const query = ref(route.query.rmaId || '')
const current = ref(null)
const missing = ref(false)
const gen = ref({ state: 'idle', progress: 0 }) // idle | running | done | failed | slow
const busy = ref(false)
const editing = ref(null) // 본문 수정 중인 필드 값
const draft = ref(null) // 다시 생성 비교 중인 새 초안 { content, generated_at }
const docEl = ref(null)
const pdfBusy = ref(false)

const rmaId = computed(() => route.query.rmaId)

async function loadHistory() {
  history.value = await api('/reports').catch(reportLoadError)
}

watch(
  () => route.query.rmaId,
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

onMounted(loadHistory)

function pick() {
  const id = query.value.trim().toUpperCase()
  if (id) router.replace({ query: { rmaId: id } })
}

// 생성 진행 표시 (보고서 최초 생성 · 비교용 초안 생성 공용)
async function withProgress(fn) {
  gen.value = { state: 'running', progress: 5 }
  const tick = setInterval(() => (gen.value.progress = Math.min(95, gen.value.progress + 7)), 200)
  const slow = setTimeout(() => (gen.value.state = 'slow'), 30000)
  try {
    await fn()
    gen.value = { state: 'done', progress: 100 }
  } catch (e) {
    gen.value = { state: 'failed', progress: 0 }
    toast({ title: e.status === 503 ? 'AI 일시 불가' : e.status === 404 ? 'RMA를 찾을 수 없습니다' : '보고서 생성에 실패했습니다', tone: 'red' })
  } finally {
    clearInterval(tick)
    clearTimeout(slow)
  }
}

function generate() {
  editing.value = null
  const id = rmaId.value
  if (current.value) {
    // 다시 생성: 저장하지 않고 비교
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

// ---------- 다시 생성 비교 ----------
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

// ---------- PDF ----------
async function downloadPdf() {
  pdfBusy.value = true
  try {
    await saveElementAsPdf(docEl.value, `${current.value.rma_id}_AI분석보고서.pdf`)
  } catch {
    toast({ title: 'PDF를 만들지 못했습니다', tone: 'red' })
  } finally {
    pdfBusy.value = false
  }
}

// ---------- 보고서 이력 필터 ----------
const hf = persistedRef('reports.history', { review: '', product: '', defectType: '' }) // 새로고침·이동 후에도 유지
const uniq = (key) => [...new Set((history.value || []).map((h) => h[key]))].sort()
const filteredHistory = computed(() =>
  (history.value || []).filter((h) =>
    (!hf.value.review || (hf.value.review === 'done') === h.reviewed) &&
    (!hf.value.product || h.product === hf.value.product) &&
    (!hf.value.defectType || h.defect_type === hf.value.defectType),
  ),
)
</script>

<template>
  <PageHead :crumb="false" title="AI 분석 보고서" description="SSD 사례별 보고서를 생성하고, 수정, 검토, 취소할 수 있습니다.">
    <template #actions>
      <Button variant="outline" :disabled="!current || !!editing || !!draft" :loading="pdfBusy" @click="downloadPdf"><FileDown class="size-4" />PDF 다운로드</Button>
    </template>
  </PageHead>

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

  <!-- 다시 생성 비교: 기존 | 새 초안 (반반) -->
  <section v-if="draft && current" class="rounded-[14px] border bg-card">
    <div class="flex flex-wrap items-center gap-3 border-b px-6 py-4">
      <ArrowLeftRight class="size-4 text-primary" />
      <h2 class="text-[16px] font-bold">{{ current.rma_id }} 보고서 비교</h2>
      <span class="text-sm text-muted-foreground">
        <template v-if="changed.length">바뀐 항목: <b class="font-semibold text-foreground">{{ changed.join(', ') }}</b></template>
        <template v-else>새 초안의 내용이 기존과 같습니다</template>
      </span>
      <!-- 결정 버튼은 위에 둔다 (오른쪽 아래는 AI 어시스턴트 버튼이 가린다) -->
      <span class="ml-auto flex gap-2">
        <Button variant="outline" :disabled="busy" @click="keepCurrent">기존 보고서 유지</Button>
        <Button :loading="busy" @click="useDraft"><RefreshCw class="size-4" />새 초안으로 교체</Button>
      </span>
    </div>
    <div class="grid grid-cols-2 divide-x">
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

  <div v-else class="grid grid-cols-[320px_1fr] items-start gap-4">
    <Card title="보고서 이력" :description="history ? `${filteredHistory.length} / ${history.length}건, 미확인 우선` : ''" :padded="false" class="sticky top-[84px]">
      <!-- 이력 박스는 목록 길이만큼만 차지하고(보고서 높이에 맞추지 않음), 스크롤해도 상단 메뉴 아래에 붙어 있다 -->
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
        <!-- 머리말: SK Red→Orange 선 + 옅은 그라데이션 띠로 본문과 구분 (PDF에도 그대로 나오도록 hex 그라데이션) -->
        <div class="h-1" style="background: linear-gradient(90deg, #ea002c 0%, #f47725 100%)" />
        <header class="border-b border-[#f3dfe3] px-9 pb-6 pt-7" style="background: linear-gradient(160deg, #fff1f3 0%, #fff7f1 48%, #ffffff 100%)">
        <div class="flex items-start justify-between gap-4">
          <p class="text-[13px] font-extrabold tracking-[0.8px] text-primary">E!FFECT / SSD ANALYSIS REPORT</p>
          <Badge :tone="current.reviewed ? 'green' : 'yellow'">{{ current.reviewed ? '확인 완료' : '미확인' }}</Badge>
        </div>
        <h2 class="mt-3 text-[32px] font-extrabold leading-[1.25] tracking-[-0.03em]">{{ current.product }} {{ current.defect_type }}<br />RMA 분석 보고서</h2>
        <div class="mt-2 flex items-center justify-between gap-3">
          <p class="text-sm font-medium text-[#5f6673]">
            {{ current.rma_id }}, SSD 분석 초안<span v-if="current.content.edited_by">, {{ current.content.edited_by }} 수정 {{ current.content.edited_at.replace('T', ' ') }}</span>
            <span v-if="current.reviewed">, 검토 {{ current.reviewed_by }} {{ fmtDateTime(current.reviewed_at) }}</span>
          </p>
          <Button v-if="!editing" data-pdf-ignore variant="outline" size="sm" @click="startEdit"><PenLine class="size-3.5" />본문 수정</Button>
        </div>

        <dl class="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-[#f1dfe2] bg-[#f1dfe2] text-[13px]">
          <div class="bg-white/80 px-4 py-3"><dt class="text-muted-foreground">대상 제품</dt><dd class="mt-1 text-[15px] font-bold">{{ current.product }} / SSD</dd></div>
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
