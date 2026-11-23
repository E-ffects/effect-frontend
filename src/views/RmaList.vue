<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RotateCcw, Search, X } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DateRange from '@/components/ui/DateRange.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import { api, fmtDate, saveFile } from '@/lib/api'
import { useMeta } from '@/lib/meta'
import { auth, toast } from '@/lib/state'
import { CS_STATUS, LEVEL_TONE, pick, RECURRENCE } from '@/lib/caseLabels'

// RMA 목록 (Spring GET /api/rmas). 필터·정렬 값은 API 값 그대로 보낸다
// - product: 품번(part_no), status: cs_status(OPEN 등), defectType: 대분류 이름(major_name)
// - 심각도·재발 필터와 심각도 정렬은 QUALITY만 (CS가 보내면 Spring이 400)
const route = useRoute()
const router = useRouter()
const meta = useMeta()
const quality = computed(() => auth.user?.role === 'QUALITY')

const QUALITY_ONLY = ['severity', 'recurrence']
const ALL_KEYS = ['q', 'product', 'defectType', 'classification', 'status', 'severity', 'recurrence', 'from', 'to', 'overDays']
const FILTER_KEYS = computed(() => (quality.value ? ALL_KEYS : ALL_KEYS.filter((k) => !QUALITY_ONLY.includes(k))))
const LABELS = { q: '검색어', product: '제품', defectType: '불량 유형', classification: '분류 상태', status: '처리 상태', severity: '심각도', recurrence: '재발 판정', from: '접수 시작', to: '접수 종료', overDays: '경과일' }
const MAJORS = ['전기적 불량', '납땜·실장 불량', '구조·적층 불량', '외관 불량', '치수·가공 불량', '식별·추적 불량', '미확정']
const CLASSIFICATION = {
  CLASSIFIED: { label: '분류 완료', tone: 'blue' },
  INSUFFICIENT_INFO: { label: '정보 부족', tone: 'gray' },
  UNCLASSIFIED: { label: '미분류', tone: 'gray' },
  SYNTHETIC_REFERENCE: { label: '기존 사례', tone: 'outline' },
}
const toOptions = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.label }))
const SEVERITIES = Array.from({ length: 10 }, (_, i) => String(9 - i))
const severityTone = (n) => (n >= 9 ? 'red' : n >= 8 ? 'orange' : n >= 6 ? 'blue' : 'gray')
const stageLabel = (code) => meta.value?.detection_stages?.find((s) => s.code === code)?.label || code

const draft = ref({})
const data = ref(null)
const loading = ref(false)
const failed = ref(false)
const size = computed(() => Number(route.query.size) || 30)
// 다중 정렬 (URL sort=opened_at:desc,reported_part_no:asc · 앞쪽이 우선). 지정이 없으면 접수일 최신순
const DEFAULT_SORT = [{ key: 'opened_at', dir: 'desc' }]
const sorts = computed(() => {
  const raw = route.query.sort
  if (!raw) return []
  return String(raw).split(',').map((p) => {
    const [key, dir] = p.split(':')
    return { key, dir: dir || route.query.order || 'desc' }
  }).filter((x) => x.key)
})
const shownSorts = computed(() => (sorts.value.length ? sorts.value : DEFAULT_SORT))
const sortOf = (key) => {
  const i = shownSorts.value.findIndex((x) => x.key === key)
  return i < 0 ? null : { ...shownSorts.value[i], rank: i + 1 }
}

function syncDraft() {
  draft.value = Object.fromEntries(FILTER_KEYS.value.map((k) => [k, route.query[k] || '']))
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await api('/rmas', { query: apiQuery(route.query) })
  } catch (e) {
    failed.value = true
    toast({ title: e.message, tone: 'red' })
  } finally {
    loading.value = false
  }
}

watch(
  () => route.query,
  () => {
    // 이전 화면(대시보드·알림)의 /rmas?open=ID 링크는 케이스 화면으로 보낸다
    if (route.query.open) return router.replace(`/rmas/${route.query.open}/case`)
    syncDraft()
    load()
  },
  { immediate: true, deep: true },
)

// URL 조건 → API 조건. CS는 QUALITY 전용 조건(심각도·재발, 심각도 정렬)을 빼고 보낸다
function apiQuery(query) {
  const q = { ...query }
  delete q.open
  if (!quality.value) {
    QUALITY_ONLY.forEach((k) => delete q[k])
    if (q.sort) q.sort = String(q.sort).split(',').filter((x) => !x.startsWith('severity')).join(',') || undefined
  }
  return q
}

function search() {
  if (draft.value.from && draft.value.to && draft.value.from > draft.value.to) {
    toast({ title: '검색 기간을 확인하세요', tone: 'red' })
    return
  }
  const q = Object.fromEntries(Object.entries(draft.value).filter(([, v]) => v))
  router.push({ query: { ...q, size: route.query.size, sort: route.query.sort } })
}

// 날짜는 품질 대시보드와 같은 기간 선택: 적용하면 바로 검색
function applyPeriod({ from, to }) {
  draft.value.from = from
  draft.value.to = to
  search()
}

function reset() {
  router.push({ query: { size: route.query.size } })
}

// 현재 검색 조건 전체를 CSV로 내려받는다 (페이지와 무관)
const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const { page, size: _size, ...q } = apiQuery(route.query)
    const res = await api('/rmas/export', { query: q, raw: true })
    if (res instanceof Blob) saveFile(res, 'rma.csv') // 목업
    else saveFile(await res.blob(), /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'rma.csv')
    toast({ title: `${data.value?.total ?? ''}건을 CSV로 내보냈습니다`, tone: 'green' })
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    exporting.value = false
  }
}

function removeChip(key) {
  const q = { ...route.query }
  delete q[key]
  delete q.page
  router.push({ query: q })
}

const chips = computed(() =>
  FILTER_KEYS.value.filter((k) => route.query[k]).map((k) => {
    let v = route.query[k]
    if (k === 'recurrence') v = pick(RECURRENCE, v).label
    if (k === 'status') v = pick(CS_STATUS, v).label
    if (k === 'classification') v = pick(CLASSIFICATION, v).label
    if (k === 'overDays') v = `${v}일 초과`
    return { key: k, label: `${LABELS[k]}: ${String(v).replaceAll(',', ', ')}` }
  }),
)

// 행을 누르면 케이스 화면(입력·에이전트 결과·판정)으로 간다
function openCase(id) {
  router.push(`/rmas/${id}/case`)
}

// 열 이름 클릭: 정렬 없음 → 내림차순(맨 뒤에 추가) → 오름차순 → 해제. 여러 열을 함께 걸면 앞쪽부터 차례로 적용
function setSort(key) {
  const list = sorts.value.map((x) => ({ ...x }))
  const cur = list.find((x) => x.key === key)
  if (!cur) list.push({ key, dir: 'desc' })
  else if (cur.dir === 'desc') cur.dir = 'asc'
  else list.splice(list.indexOf(cur), 1)
  pushSorts(list)
}

function pushSorts(list) {
  const q = { ...route.query }
  delete q.order
  delete q.page
  if (list.length) q.sort = list.map((x) => `${x.key}:${x.dir}`).join(',')
  else delete q.sort
  router.push({ query: q })
}

function goPage(p) {
  const q = { ...route.query, page: p }
  router.push({ query: q })
}

function setSize(s) {
  const q = { ...route.query, size: s }
  delete q.page
  router.push({ query: q })
}

const pages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.size)) : 1))
// 열 너비 비율 (표 고정 레이아웃). key = Spring 정렬 키, quality = QUALITY에게만 보이는 열
const ALL_COLUMNS = [
  { key: 'rma_id', label: 'RMA ID', w: '9%' }, { key: 'opened_at', label: '접수일', w: '8%' },
  { key: 'reported_part_no', label: '제품', w: '11%' }, { key: 'detection_stage', label: '발견 단계', w: '10%' },
  { key: 'major_name', label: '불량 유형', w: '11%' }, { key: 'minor_name', label: '소분류', w: '11%' },
  { key: 'classification_status', label: '분류 상태', w: '8%' }, { key: 'claimed_defect_qty', label: '수량', w: '6%' },
  { key: 'analysis_level', label: '수준', w: '5%' }, { key: 'severity', label: '심각도', w: '6%', quality: true },
  { key: 'cs_status', label: '처리 상태', w: '8%' }, { key: null, label: '재발', w: '9%', quality: true },
]
const columns = computed(() => ALL_COLUMNS.filter((c) => !c.quality || quality.value))
const labelOf = (key) => ALL_COLUMNS.find((c) => c.key === key)?.label || key
</script>

<template>
  <PageHead :crumb="false" title="RMA 사례 조회" description="PCB 반품 사례의 검색, 분석, 처리 이력을 확인하세요." />

  <form class="mb-3 grid grid-cols-9 gap-2 rounded-[14px] border bg-card p-4" @submit.prevent="search" @keydown.enter.prevent="search">
    <div class="col-span-6 mb-1 flex items-center gap-2">
      <label class="relative min-w-0 flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input v-model="draft.q" type="search" placeholder="RMA ID, 고객사, 제품 또는 불량 유형" aria-label="RMA 통합 검색" class="h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
      </label>
      <Button type="submit" class="shrink-0"><Search class="size-4" />검색</Button>
    </div>
    <div class="col-span-3 mb-1 flex items-center justify-end gap-2">
      <Button type="button" variant="outline" @click="reset"><RotateCcw class="size-4" />초기화</Button>
      <Button type="button" variant="outline" :loading="exporting" :disabled="!data?.total" @click="exportCsv"><Download class="size-4" />내보내기</Button>
    </div>
    <Select v-model="draft.product" placeholder="제품 전체" :options="(meta?.products || []).map((p) => ({ value: p.part_no, label: p.part_no }))" />
    <Select v-model="draft.defectType" placeholder="불량 유형 전체" :options="MAJORS" />
    <Select v-model="draft.classification" placeholder="분류 상태 전체" :options="toOptions(CLASSIFICATION)" />
    <Select v-model="draft.status" placeholder="처리 상태 전체" :options="toOptions(CS_STATUS)" />
    <template v-if="quality">
      <Select v-model="draft.severity" placeholder="심각도 전체" :options="SEVERITIES" />
      <Select v-model="draft.recurrence" placeholder="재발 판정 전체" :options="toOptions(RECURRENCE)" />
    </template>
    <DateRange :class="quality ? 'col-span-2' : 'col-span-4'" block clearable align="right" placeholder="접수 기간 전체" :max-days="Infinity" :from="draft.from" :to="draft.to" @apply="applyPeriod" />
  </form>

  <div class="mb-3 flex min-h-7 flex-wrap items-center gap-1.5">
    <span v-if="sorts.length" class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-brand-soft px-2.5 py-1 text-xs">
      정렬: <template v-for="(x, i) in sorts" :key="x.key"><span v-if="i" class="mx-0.5 text-muted-foreground">→</span>{{ labelOf(x.key) }} {{ x.dir === 'desc' ? '↓' : '↑' }}</template>
      <button class="opacity-60 hover:opacity-100" aria-label="정렬 해제" @click="pushSorts([])"><X class="size-3" /></button>
    </span>
    <span v-for="c in chips" :key="c.key" class="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
      {{ c.label }}
      <button class="opacity-60 hover:opacity-100" :aria-label="`${c.label} 제거`" @click="removeChip(c.key)"><X class="size-3" /></button>
    </span>
    <span class="ml-auto text-xs text-muted-foreground">총 <b class="text-foreground tabular">{{ data?.total ?? '—' }}</b>건</span>
  </div>

  <div class="overflow-hidden rounded-[14px] border bg-card">
    <table class="w-full table-fixed text-sm">
      <colgroup><col v-for="c in columns" :key="c.label" :style="{ width: c.w }" /></colgroup>
      <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
        <tr>
          <th v-for="c in columns" :key="c.label" class="px-3 py-2.5 text-left font-medium">
            <button
              v-if="c.key" :class="sortOf(c.key) ? 'text-foreground' : ''" class="inline-flex items-center gap-1 hover:text-foreground"
              title="클릭할 때마다 내림차순 → 오름차순 → 해제, 여러 열을 함께 정렬할 수 있습니다" @click="setSort(c.key)"
            >
              {{ c.label }}
              <template v-if="sortOf(c.key)">
                <ArrowDown v-if="sortOf(c.key).dir === 'desc'" class="size-3" /><ArrowUp v-else class="size-3" />
                <span v-if="sorts.length > 1" class="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular">{{ sortOf(c.key).rank }}</span>
              </template>
            </button>
            <span v-else>{{ c.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading && !data">
          <tr v-for="i in 10" :key="i" class="border-b"><td :colspan="columns.length" class="px-3 py-2.5"><Skeleton class="h-5" /></td></tr>
        </template>
        <tr v-else-if="failed && !data"><td :colspan="columns.length" class="py-16 text-center text-sm text-muted-foreground">잠시 후 다시 시도하세요 <Button variant="link" size="sm" @click="load">재시도</Button></td></tr>
        <tr v-else-if="data && !data.items.length">
          <td :colspan="columns.length" class="py-16 text-center text-sm text-muted-foreground">조건에 맞는 RMA가 없습니다 <Button variant="link" size="sm" @click="reset">조건 초기화</Button></td>
        </tr>
        <tr
          v-for="r in data?.items || []" :key="r.rma_id" tabindex="0"
          class="cursor-pointer border-b hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          @click="openCase(r.rma_id)" @keydown.enter="openCase(r.rma_id)"
        >
          <td class="px-3 py-2.5 font-medium">{{ r.rma_id }}</td>
          <td class="px-3 py-2.5 tabular">{{ fmtDate(r.opened_at) }}</td>
          <td class="truncate px-3 py-2.5" :title="r.reported_part_no">{{ r.reported_part_no }}</td>
          <td class="truncate px-3 py-2.5" :title="stageLabel(r.detection_stage)">{{ stageLabel(r.detection_stage) || '—' }}</td>
          <td class="truncate px-3 py-2.5" :title="r.major_name">{{ r.major_name || '—' }}</td>
          <td class="truncate px-3 py-2.5" :title="r.minor_name">{{ r.minor_name || '—' }}</td>
          <td class="px-3 py-2.5"><Badge v-if="r.classification_status" :tone="pick(CLASSIFICATION, r.classification_status).tone">{{ pick(CLASSIFICATION, r.classification_status).label }}</Badge><span v-else class="text-muted-foreground">—</span></td>
          <td class="px-3 py-2.5 tabular">{{ r.claimed_defect_qty }}</td>
          <td class="px-3 py-2.5"><Badge v-if="r.analysis_level" :tone="LEVEL_TONE[r.analysis_level]">{{ r.analysis_level }}</Badge><span v-else class="text-muted-foreground">—</span></td>
          <td v-if="quality" class="px-3 py-2.5"><Badge v-if="r.severity != null" :tone="severityTone(r.severity)">{{ r.severity }}</Badge><span v-else class="text-muted-foreground">—</span></td>
          <td class="px-3 py-2.5"><Badge :tone="pick(CS_STATUS, r.cs_status).tone">{{ pick(CS_STATUS, r.cs_status).label }}</Badge></td>
          <td v-if="quality" class="px-3 py-2.5"><Badge v-if="r.recurrence_verdict" :tone="pick(RECURRENCE, r.recurrence_verdict).tone">{{ pick(RECURRENCE, r.recurrence_verdict).label }}</Badge><span v-else class="text-muted-foreground">—</span></td>
        </tr>
      </tbody>
    </table>
    <div class="flex items-center justify-between border-t px-4 py-2.5 text-xs">
      <div class="flex items-center gap-2 text-muted-foreground">
        페이지당
        <Select :model-value="String(size)" size="sm" :options="['30', '50', '100']" @update:model-value="setSize" />
        행
      </div>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" :disabled="!data || data.page <= 1" aria-label="이전" @click="goPage(data.page - 1)"><ChevronLeft class="size-4" /></Button>
        <span class="px-2 tabular">{{ data?.page ?? 1 }} / {{ pages }}</span>
        <Button variant="ghost" size="icon-sm" :disabled="!data || data.page >= pages" aria-label="다음" @click="goPage(data.page + 1)"><ChevronRight class="size-4" /></Button>
      </div>
    </div>
  </div>
</template>
