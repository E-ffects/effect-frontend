<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronRight as Caret, Download, RotateCcw, Search, X } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DateRange from '@/components/ui/DateRange.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import RmaDetailCs from '@/components/rma/RmaDetailCs.vue'
import RmaDetailQuality from '@/components/rma/RmaDetailQuality.vue'
import { api, fmtDate, saveFile } from '@/lib/api'
import { recurrenceTone, SEVERITY_TONE, STATUS_TONE } from '@/lib/badges'
import { useMeta } from '@/lib/meta'
import { auth, chatContext, toast } from '@/lib/state'

const route = useRoute()
const router = useRouter()
const meta = useMeta()

const FILTER_KEYS = ['q', 'product', 'defectType', 'classification', 'status', 'severity', 'channel', 'recurrence', 'from', 'to', 'overDays']
const LABELS = { q: '검색어', product: '제품', defectType: '불량 유형', classification: '분류 상태', status: '처리 상태', severity: '심각도', channel: '접수 채널', recurrence: '재발 여부', from: '접수 시작', to: '접수 종료', overDays: '경과일' }
const CLASSIFICATION = ['분류 완료', '복합 증상', '정보 부족', '검토 필요', '미분류']
const RECURRENCE = [
  { value: 'suspected', label: '재발 의심' },
  { value: 'confirmed', label: '재발 확정' },
  { value: 'none', label: '없음' },
]

const draft = ref({})
const data = ref(null)
const loading = ref(false)
const failed = ref(false)
const openId = computed(() => route.query.open || null)
const size = computed(() => Number(route.query.size) || 30)
// 다중 정렬 (URL sort=claim_date:desc,product:asc · 앞쪽이 우선). 지정이 없으면 접수일 최신순
const DEFAULT_SORT = [{ key: 'claim_date', dir: 'desc' }]
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
  draft.value = Object.fromEntries(FILTER_KEYS.map((k) => [k, route.query[k] || '']))
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    const res = await api('/rmas', { query: { ...route.query } })
    data.value = res
    if (openId.value && res.open_found === false) {
      toast({ title: res.open_exists ? '현재 검색 조건에 없는 RMA입니다' : 'RMA를 찾을 수 없습니다', description: openId.value, tone: 'red' })
    }
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
    syncDraft()
    chatContext.rmaId = openId.value
    load()
  },
  { immediate: true, deep: true },
)
onBeforeUnmount(() => (chatContext.rmaId = null))

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
    const { page, open, size: _size, ...q } = route.query
    const res = await api('/rmas/export', { query: q, raw: true })
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'rma.csv'
    saveFile(await res.blob(), name)
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
  delete q.open
  router.push({ query: q })
}

const chips = computed(() =>
  FILTER_KEYS.filter((k) => route.query[k]).map((k) => {
    let v = route.query[k]
    if (k === 'recurrence') v = RECURRENCE.find((r) => r.value === v)?.label || v
    if (k === 'overDays') v = `${v}일 초과`
    return { key: k, label: `${LABELS[k]}: ${String(v).replaceAll(',', ', ')}` }
  }),
)

function toggleRow(id) {
  const q = { ...route.query, page: data.value.page }
  if (openId.value === id) delete q.open
  else q.open = id
  router.replace({ query: q })
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
  delete q.open
  delete q.order
  delete q.page
  if (list.length) q.sort = list.map((x) => `${x.key}:${x.dir}`).join(',')
  else delete q.sort
  router.push({ query: q })
}

function goPage(p) {
  const q = { ...route.query, page: p }
  delete q.open // 페이지 이동 시 펼친 행은 닫힘
  router.push({ query: q })
}

function setSize(s) {
  const q = { ...route.query, size: s }
  delete q.page
  router.push({ query: q })
}

const pages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.size)) : 1))
// 열 너비 비율 (표 고정 레이아웃): 내용 길이에 맞춰 나눠 수량이 불량 유형 바로 옆에 오게 한다
const columns = [
  { key: 'rma_id', label: 'RMA ID', w: '9%' }, { key: 'claim_date', label: '접수일', w: '9%' }, { key: 'product', label: '제품', w: '6%' },
  { key: 'claim_channel', label: '접수 채널', w: '11%' }, { key: 'defect_type', label: '불량 유형', w: '12%' }, { key: 'defect_subtype', label: '소분류', w: '13%' },
  { key: 'classification_status', label: '분류 상태', w: '9%' }, { key: 'claim_qty', label: '수량', w: '5%' },
  { key: 'severity', label: '심각도', w: '9%' }, { key: 'claim_status', label: '처리 상태', w: '8%' }, { key: null, label: '재발', w: '9%' },
]
const classificationTone = (s) => (s === '분류 완료' ? 'blue' : s === '정보 부족' || s === '미분류' ? 'gray' : 'yellow')
const labelOf = (key) => columns.find((c) => c.key === key)?.label || key
const Detail = computed(() => (auth.user?.role === 'QUALITY' ? RmaDetailQuality : RmaDetailCs))

let scrolledFor = null
function scrollToOpen(el) {
  if (!el || scrolledFor === openId.value) return
  scrolledFor = openId.value
  setTimeout(() => el.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
}
</script>

<template>
  <PageHead :crumb="false" title="RMA 사례 조회" description="SSD 반품 사례의 검색, 분석, 처리 이력을 확인하세요." />

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
    <Select v-model="draft.product" placeholder="제품 전체" :options="(meta?.products || []).map((p) => ({ value: p.code, label: `${p.code} ${p.name}` }))" />
    <Select v-model="draft.defectType" placeholder="불량 유형 전체" :options="meta?.defect_types || []" />
    <Select v-model="draft.classification" placeholder="분류 상태 전체" :options="CLASSIFICATION" />
    <Select v-model="draft.status" placeholder="처리 상태 전체" :options="meta?.statuses || []" />
    <Select v-model="draft.severity" placeholder="심각도 전체" :options="meta?.severities || []" />
    <Select v-model="draft.channel" placeholder="접수 채널 전체" :options="meta?.channels || []" />
    <Select v-model="draft.recurrence" placeholder="재발 여부 전체" :options="RECURRENCE" />
    <DateRange class="col-span-2" block clearable align="right" placeholder="접수 기간 전체" :max-days="Infinity" :from="draft.from" :to="draft.to" @apply="applyPeriod" />
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
      <colgroup><col class="w-9" /><col v-for="c in columns" :key="c.label" :style="{ width: c.w }" /></colgroup>
      <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
        <tr>
          <th />
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
          <tr v-for="i in 10" :key="i" class="border-b"><td colspan="12" class="px-3 py-2.5"><Skeleton class="h-5" /></td></tr>
        </template>
        <tr v-else-if="failed && !data"><td colspan="12" class="py-16 text-center text-sm text-muted-foreground">잠시 후 다시 시도하세요 <Button variant="link" size="sm" @click="load">재시도</Button></td></tr>
        <tr v-else-if="data && !data.items.length">
          <td colspan="12" class="py-16 text-center text-sm text-muted-foreground">조건에 맞는 RMA가 없습니다 <Button variant="link" size="sm" @click="reset">조건 초기화</Button></td>
        </tr>
        <template v-for="r in data?.items || []" :key="r.rma_id">
          <tr :class="openId === r.rma_id ? 'bg-muted/60' : 'hover:bg-muted/40'" class="cursor-pointer scroll-mt-20 border-b" @click="toggleRow(r.rma_id)">
            <td class="pl-3"><Caret :class="openId === r.rma_id ? 'rotate-90' : ''" class="size-4 text-muted-foreground transition-transform" /></td>
            <td class="px-3 py-2.5 font-medium">{{ r.rma_id }}</td>
            <td class="px-3 py-2.5 tabular">{{ fmtDate(r.claim_date) }}</td>
            <td class="px-3 py-2.5">{{ r.product }}</td>
            <td class="truncate px-3 py-2.5" :title="r.claim_channel">{{ r.claim_channel }}</td>
            <td class="truncate px-3 py-2.5" :title="r.defect_type">{{ r.defect_type }}</td>
            <td class="truncate px-3 py-2.5" :title="r.defect_subtype">{{ r.defect_subtype || '—' }}</td>
            <td class="px-3 py-2.5"><Badge v-if="r.classification_status" :tone="classificationTone(r.classification_status)">{{ r.classification_status }}</Badge><span v-else class="text-muted-foreground">—</span></td>
            <td class="px-3 py-2.5 tabular">{{ r.claim_qty }}</td>
            <td class="px-3 py-2.5"><Badge :tone="SEVERITY_TONE[r.severity]">{{ r.severity }}</Badge></td>
            <td class="px-3 py-2.5"><Badge :tone="STATUS_TONE[r.claim_status]">{{ r.claim_status }}</Badge></td>
            <td class="px-3 py-2.5"><Badge v-if="r.recurrence" :tone="recurrenceTone(r.recurrence)">{{ r.recurrence }}</Badge><span v-else class="text-muted-foreground">—</span></td>
          </tr>
          <tr v-if="openId === r.rma_id" :ref="scrollToOpen" class="border-b">
            <td colspan="12" class="p-0"><component :is="Detail" :key="r.rma_id" :rma-id="r.rma_id" @changed="load" /></td>
          </tr>
        </template>
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
