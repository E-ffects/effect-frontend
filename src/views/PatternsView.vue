<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FileText, Sparkles } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import DateRange from '@/components/ui/DateRange.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ColumnChart from '@/components/charts/ColumnChart.vue'
import PageHead from '@/components/PageHead.vue'
import PatternReportDialog from '@/components/PatternReportDialog.vue'
import { api, fmtWon } from '@/lib/api'
import { GRADE_TONE } from '@/lib/badges'
import { reportLoadError, reportRoute } from '@/lib/state'
import { useMeta, usePeriod } from '@/lib/meta'

// SCR-PAT-001 불량 패턴 · 주요 원인 분석
const route = useRoute()
const router = useRouter()
const meta = useMeta()
const { from, to, apply } = usePeriod(90)
const product = ref(route.query.product || '')
const list = ref(null)
const detail = ref(null)
const reportTarget = ref('') // 보고서 대상 RMA (기본: 가장 최근 근거)
// 근거 RMA 심각도 점 색
const SEV_DOT = { CRITICAL: 'bg-sk-red', HIGH: 'bg-sk-orange', MEDIUM: 'bg-[#4269af]', LOW: 'bg-[#9aa1ac]', '판정 보류': 'bg-[#d5d9df]' }
// 주원인·부원인 비율 (부원인이 없으면 미수집)
const causeRows = computed(() =>
  detail.value
    ? [
        { label: '주원인', name: detail.value.primary_cause, ratio: detail.value.primary_ratio, main: true },
        { label: '부원인', name: detail.value.secondary_cause, ratio: detail.value.secondary_ratio, main: false },
      ]
    : [],
)
// 주요 원인 분포: 세로 막대 그래프 (상위 12개)
const causeTiles = computed(() => (list.value?.causes || []).slice(0, 12))
const reportOpen = ref(false)
const selectedId = computed(() => route.query.patternId || list.value?.patterns[0]?.pattern_id || null)

watch(
  [from, to, () => route.query.product],
  async () => {
    list.value = null
    list.value = await api('/patterns', { query: { product: route.query.product, from: from.value, to: to.value } }).catch(reportLoadError)
  },
  { immediate: true },
)

let detailSeq = 0
const detailLoading = ref(false)
watch(
  [selectedId, from, to],
  async ([id]) => {
    // 이전 패턴 내용을 그대로 둔 채 새 내용만 갈아 끼운다 (빈 화면으로 깜빡이며 높이가 흔들리지 않게)
    const seq = ++detailSeq
    detailLoading.value = true
    const res = id ? await api(`/patterns/${id}`, { query: { from: from.value, to: to.value } }).catch(reportLoadError) : null
    if (seq !== detailSeq) return // 더 나중에 누른 패턴의 응답이 우선
    detail.value = res || null
    detailLoading.value = false
    reportTarget.value = detail.value?.evidence[0]?.rma_id || ''
  },
  { immediate: true },
)

function applyProduct() {
  const q = { ...route.query, product: product.value || undefined }
  delete q.patternId
  router.replace({ query: q })
}

function select(id) {
  router.replace({ query: { ...route.query, patternId: id } })
}
</script>

<template>
  <PageHead :crumb="false" title="불량 패턴 및 주요 원인 분석" description="SSD 반복 불량(같은 패턴 2건 이상)의 주요 원인과 근거 사례를 함께 확인하세요." />

  <Card class="mb-4" title="주요 원인 분포" :description="`선택 기간과 제품의 주요 원인별 건수${(list?.causes.length || 0) > 12 ? `, 상위 12개 (전체 ${list.causes.length}개)` : ''}${causeTiles.length > 6 ? ', 좌우로 스크롤하면 나머지 원인이 보입니다' : ''}`" :padded="false">
    <div class="px-5 pb-4 pt-1">
      <Skeleton v-if="!list" class="h-44" />
      <p v-else-if="!causeTiles.length" class="py-8 text-center text-sm text-muted-foreground">집계된 원인이 없습니다</p>
      <ColumnChart v-else :items="causeTiles.map((c) => ({ key: c.cause, label: c.cause, value: c.count }))" :height="170" :visible="6" y-label="건수 (건)" />
    </div>
  </Card>

  <!-- 순위표와 근거 RMA는 위아래 끝을 맞춘다: 높이는 순위표 내용이 정하고(최소 460px · 최대 표 860px),
       근거 박스는 그 높이에 맞춰 안에서 스크롤 → 제품 필터로 행이 줄어도 표 아래에 빈칸이 생기지 않는다 -->
  <div class="grid grid-cols-3 gap-4">
    <Card class="col-span-2 min-h-[460px]" title="반복 불량 패턴 순위" :description="list ? `행을 누르면 오른쪽 근거가 갱신됩니다 (${list.patterns.length}개 패턴)` : '행을 누르면 오른쪽 근거가 갱신됩니다'" :padded="false">
      <template #actions>
        <Select v-model="product" size="sm" placeholder="전체 SSD 제품" :options="(meta?.products || []).map((p) => ({ value: p.code, label: `${p.code} ${p.name}` }))" @update:model-value="applyProduct" />
        <DateRange :from="from" :to="to" @apply="apply" />
      </template>
      <div class="px-5 pb-4 pt-3">
        <Skeleton v-if="!list" class="h-64" />
        <p v-else-if="!list.patterns.length" class="py-16 text-center text-sm text-muted-foreground">선택한 조건에 반복 불량 패턴이 없습니다</p>
        <div v-else class="max-h-[860px] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
            <tr><th class="py-2 text-left font-medium">순위</th><th class="text-left font-medium">패턴 ID</th><th class="text-left font-medium">제품</th><th class="text-left font-medium">불량 유형</th><th class="text-left font-medium">심각도</th><th class="text-right font-medium">발생</th><th class="text-right font-medium">점수</th><th class="pl-4 text-left font-medium">주요 원인</th></tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in list.patterns" :key="p.pattern_id" :class="selectedId === p.pattern_id ? 'bg-muted' : 'hover:bg-muted/50'" class="cursor-pointer border-t" @click="select(p.pattern_id)">
              <td class="py-2.5 tabular text-muted-foreground">{{ i + 1 }}</td>
              <td class="py-2.5 font-medium">{{ p.pattern_id }}</td>
              <td class="py-2.5">{{ p.product }}</td>
              <td class="py-2.5">{{ p.defect_type }}</td>
              <td class="py-2.5"><Badge :tone="GRADE_TONE[p.investigation_grade] || 'outline'">{{ p.investigation_grade || '-' }}</Badge></td>
              <td class="py-2.5 text-right tabular">{{ p.count }}건</td>
              <td class="py-2.5 text-right font-semibold tabular">{{ p.score.toFixed(1) }}</td>
              <td class="py-2.5 pl-4">{{ p.primary_cause }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </Card>

    <div class="relative min-h-[460px]">
      <Card class="absolute inset-0" title="선택 패턴 근거 RMA">
        <template #actions>
          <Button variant="outline" size="xs" :disabled="!detail" @click="reportOpen = true"><FileText class="size-3" />패턴 요약 보고서</Button>
        </template>
        <div class="-mr-3 h-full overflow-y-auto pr-3">
        <Skeleton v-if="!detail" class="h-48" />
        <div v-else :class="detailLoading ? 'opacity-60' : ''" class="space-y-6 transition-opacity">
          <div>
            <p class="text-xs font-semibold text-muted-foreground">{{ detail.pattern_id }}</p>
            <p class="mt-0.5 text-[19px] font-bold tracking-[-0.02em]">{{ detail.product }} {{ detail.defect_type }}</p>
          </div>

          <!-- 핵심 수치 -->
          <dl class="grid grid-cols-4 divide-x overflow-hidden rounded-xl border bg-muted/40 text-center">
            <div class="px-2 py-3"><dt class="text-xs text-muted-foreground">심각도</dt><dd class="mt-1.5"><Badge :tone="GRADE_TONE[detail.investigation_grade] || 'outline'" class="text-[13px]">{{ detail.investigation_grade }}</Badge></dd></div>
            <div class="px-2 py-3"><dt class="text-xs text-muted-foreground">우선순위</dt><dd class="mt-1 text-[18px] font-bold tabular">{{ detail.priority_rank }}<small class="ml-0.5 text-xs font-medium text-muted-foreground">위</small></dd></div>
            <div class="px-2 py-3"><dt class="text-xs text-muted-foreground">미해결</dt><dd class="mt-1 text-[18px] font-bold tabular" :class="detail.unresolved ? 'text-sk-orange' : ''">{{ detail.unresolved }}<small class="ml-0.5 text-xs font-medium text-muted-foreground">건</small></dd></div>
            <div class="px-2 py-3"><dt class="text-xs text-muted-foreground">손실액</dt><dd class="mt-1 text-[18px] font-bold tabular">{{ fmtWon(detail.loss) }}</dd></div>
          </dl>

          <!-- 원인 -->
          <section>
            <h4 class="mb-2.5 text-[13px] font-bold">주요 원인</h4>
            <ul class="space-y-3">
              <li v-for="c in causeRows" :key="c.label">
                <div class="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span><span class="mr-2 text-xs font-semibold text-muted-foreground">{{ c.label }}</span><b class="font-bold">{{ c.name }}</b></span>
                  <span class="font-bold tabular">{{ c.ratio != null ? `${c.ratio}%` : '—' }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded bg-chart-track"><div :class="c.main ? 'bg-sk-red' : 'bg-sk-red-light'" class="h-full rounded" :style="{ width: (c.ratio || 0) + '%' }" /></div>
              </li>
            </ul>
            <p v-if="detail.unresolved" class="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              원인 비율은 처리완료(원인 확정) 건 기준입니다. 이 패턴의 {{ detail.unresolved }}건은 아직 원인이 확정되지 않았습니다.
            </p>
          </section>

          <!-- 제조 이력 -->
          <section>
            <h4 class="mb-2.5 text-[13px] font-bold">제조 이력</h4>
            <dl class="grid grid-cols-[4.5rem_1fr] items-start gap-x-3 gap-y-3 text-sm">
              <dt class="pt-1 text-muted-foreground">영향 설비</dt>
              <dd>
                <span class="flex flex-wrap items-center gap-1.5">
                  <span v-for="e in detail.equipments" :key="e.equipment_id" class="rounded-md bg-muted px-2 py-1 text-[13px] font-semibold tabular">{{ e.equipment_id }} <span class="font-medium text-muted-foreground">{{ e.count }}건</span></span>
                  <span v-if="!detail.equipments.length" class="text-muted-foreground">이력 미확인</span>
                </span>
                <span class="mt-1 block text-xs text-muted-foreground">{{ detail.equipment_status }}</span>
              </dd>
              <dt class="pt-1 text-muted-foreground">영향 LOT</dt>
              <dd>
                <span v-if="!detail.lots.length" class="text-muted-foreground">이력 미확인</span>
                <span v-else class="flex flex-wrap items-center gap-1.5">
                  <span v-for="l in detail.lots.slice(0, 4)" :key="l.lot" class="rounded-md bg-muted px-2 py-1 text-[13px] font-semibold tabular">{{ l.lot }} <span class="font-medium text-muted-foreground">{{ l.count }}</span></span>
                  <span v-if="detail.lots.length > 4" class="text-xs font-semibold text-muted-foreground" :title="detail.lots.slice(4).map((l) => `${l.lot}(${l.count})`).join(', ')">+{{ detail.lots.length - 4 }}개</span>
                </span>
              </dd>
            </dl>
          </section>

          <div class="rounded-xl border bg-muted/30 p-4">
            <label class="mb-2 block text-[13px] font-bold" for="report-target">보고서 대상 RMA</label>
            <div class="flex gap-2">
              <select id="report-target" v-model="reportTarget" class="h-9 min-w-0 flex-1 rounded-lg border bg-card px-2.5 text-sm font-medium">
                <option v-for="e in detail.evidence" :key="e.rma_id" :value="e.rma_id">{{ e.rma_id }}, {{ e.severity }}</option>
              </select>
              <Button :disabled="!reportTarget" @click="router.push(reportRoute(reportTarget))"><Sparkles class="size-4" />보고서 생성</Button>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">보고서가 있으면 조회, 없으면 AI 보고서 탭에서 바로 생성합니다.</p>
          </div>

          <section>
            <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h4 class="text-[13px] font-bold">근거 RMA <span class="font-semibold text-muted-foreground">{{ detail.evidence.length }}건</span></h4>
              <span class="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span v-for="(cls, sev) in SEV_DOT" :key="sev" class="flex items-center gap-1"><i :class="cls" class="size-2 rounded-full" />{{ sev === '판정 보류' ? '보류' : sev }}</span>
              </span>
            </div>
            <div class="grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
              <button
                v-for="e in detail.evidence"
                :key="e.rma_id"
                class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] font-semibold tabular hover:border-brand-line hover:bg-brand-soft"
                :title="`${e.rma_id}, ${e.severity}`"
                @click="router.push({ path: '/rmas', query: { open: e.rma_id } })"
              >
                <i :class="SEV_DOT[e.severity] || SEV_DOT['판정 보류']" class="size-2 shrink-0 rounded-full" />{{ e.rma_id }}
              </button>
            </div>
          </section>
        </div>
        </div>
      </Card>
    </div>
  </div>

  <PatternReportDialog v-model:open="reportOpen" :pattern-id="selectedId" :from="from" :to="to" :show-link="false" />
</template>
