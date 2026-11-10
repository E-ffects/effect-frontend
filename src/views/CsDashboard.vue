<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, FileText, Inbox, MessageSquareWarning } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ProductSatTable from '@/components/ProductSatTable.vue'
import DashboardHeader from '@/components/DashboardHeader.vue'
import KpiCard from '@/components/KpiCard.vue'
import KpiSection from '@/components/KpiSection.vue'
import RmaReportDialog from '@/components/RmaReportDialog.vue'
import ScoreTip from '@/components/ScoreTip.vue'
import CsScoreTip from '@/components/CsScoreTip.vue'
import ImportanceTip from '@/components/ImportanceTip.vue'
import SeverityTip from '@/components/SeverityTip.vue'
import TrendWidget from '@/components/TrendWidget.vue'
import WidgetBoard from '@/components/WidgetBoard.vue'
import { api } from '@/lib/api'
import { IMPORTANCE_TONE, SEVERITY_TONE, STATUS_TONE } from '@/lib/badges'
import { deltaNum, deltaPct, deltaShort, rateCalc, tone } from '@/lib/format'
import { usePeriod } from '@/lib/meta'
import { reportLoadError, toast } from '@/lib/state'

const router = useRouter()
const { from, to, apply } = usePeriod(30)
const data = ref(null)
const editing = ref(false)
const reportOpen = ref(false)
const reportRma = ref(null)

const titles = { byProduct: '제품별 RMA 및 고객 만족도', lowSatisfaction: '고객 만족도 최하위 제품', statusDist: '처리 및 대응 현황', priority: '고객 응대 우선순위 TOP 5', trend: 'RMA 접수 추이' }
// 상태 '접수'는 화면에서 '분석 대기'로 부른다 (필터 값은 그대로 '접수')
const STATUS_LABEL = { 접수: '분석 대기' }
const STATUS_DESC = { 접수: '접수 후 분석 전', 분석중: '불량 분석, 검사 중', 원인확정: '처리 방법 결정', 처리완료: '고객 안내 완료' }

watch(
  [from, to],
  async () => {
    data.value = null
    try {
      data.value = await api('/dashboard/cs', { query: { from: from.value, to: to.value } })
    } catch (e) {
      reportLoadError(e)
    }
  },
  { immediate: true },
)

// 처리 상태 비율 막대 색 (상태 배지 색과 같은 계열)
const STATUS_BAR = { 접수: 'bg-amber-400', 분석중: 'bg-sky-500', 원인확정: 'bg-violet-500', 처리완료: 'bg-emerald-500' }
// 선택 기간 RMA가 많은 제품 5개 + 만족도
const topProducts = computed(() => (data.value ? [...data.value.by_product].sort((a, b) => b.count - a.count).slice(0, 5) : []))
// 만족도 평균이 낮은 제품 5개 (응답이 있는 제품만)
const lowProducts = computed(() =>
  data.value ? data.value.by_product.filter((p) => p.satisfaction != null).sort((a, b) => a.satisfaction - b.satisfaction || b.satisfaction_n - a.satisfaction_n).slice(0, 5) : [],
)
const statusTotal = computed(() => data.value?.status_dist.status.reduce((s, x) => s + x.count, 0) || 0)
const period = () => ({ from: from.value, to: to.value })
const toList = (q = {}, withPeriod = true) => router.push({ path: '/rmas', query: { ...(withPeriod ? period() : {}), ...q } })
</script>

<template>
  <DashboardHeader
    title="고객대응 대시보드" tagline="고객의 문제를 더 빠르고 정확하게 해결하세요"
    :link="data?.priority[0] ? { label: `${data.priority[0].rma_id} 상세 확인`, to: { path: '/rmas', query: { open: data.priority[0].rma_id } } } : null"
    :from="from" :to="to" :crumb="false" summary-path="/dashboard/cs/summary" :editing="editing"
    @apply="apply" @edit="editing = true"
  />

  <KpiSection performance-label="고객 대응 성과" :overview="3" :performance="3">
    <template #overview>
      <template v-if="data">
        <KpiCard label="RMA 건수" :icon="Inbox" :value="data.kpis.new_claims.value" unit="건" :delta="deltaShort(data.kpis.new_claims.change, '건')" :delta-tone="tone(data.kpis.new_claims.change)" note="직전 동기간 대비" @click="toList()" />
        <KpiCard label="처리 대기" :icon="Clock" :value="data.kpis.pending.value" unit="건" @click="toList({ status: '접수,분석중,원인확정' }, false)">
          <template #foot>
            <button v-if="data.kpis.pending.over7" class="font-semibold text-sk-orange hover:underline" @click.stop="toList({ status: '접수,분석중,원인확정', overDays: 7 }, false)">7일 초과 {{ data.kpis.pending.over7 }}건 ›</button>
            <span class="text-[#6f7684]"><template v-if="data.kpis.pending.over7">&nbsp; </template>접수, 분석중, 원인확정</span>
          </template>
        </KpiCard>
        <KpiCard label="고객 불만" :icon="MessageSquareWarning" :value="data.kpis.complaints.value" unit="개" :delta="deltaShort(data.kpis.complaints.change_pct)" :delta-tone="tone(data.kpis.complaints.change_pct)" note="클레임 수량, 직전 대비" @click="toList()" />
      </template>
      <template v-else><Skeleton v-for="i in 3" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>
    <template #performance>
      <template v-if="data">
        <KpiCard performance label="평균 고객 만족도" :value="data.kpis.satisfaction.value?.toFixed(2)" unit="/ 5점" @click="toList({ status: '처리완료' }, false)"
          :formula="{ expr: '고객 만족도 응답 점수 합 ÷ 응답 수 (기준일까지 누적)', calc: rateCalc(data.kpis.satisfaction, '점'), note: `목표 ${data.kpis.satisfaction.target}점은 가안입니다. 만족도는 처리완료 후 고객 응답(1~5점)으로 기록되며, 응답이 없는 건은 빼고 계산합니다.` }">
          <template #foot>
            <!-- 현재 / 목표: 5점 만점 막대 위에 목표 위치 표시 -->
            <span v-if="data.kpis.satisfaction.value != null" class="block">
              <span class="relative mb-1.5 block h-1.5 rounded-full bg-[#f3e3d6]">
                <i class="absolute inset-y-0 left-0 rounded-full bg-[#f5b301]" :style="{ width: (data.kpis.satisfaction.value / 5) * 100 + '%' }" />
                <i class="absolute -inset-y-1 w-0.5 rounded bg-foreground" :style="{ left: (data.kpis.satisfaction.target / 5) * 100 + '%' }" />
              </span>
              <span class="text-[#6f7684]">목표 <b class="font-semibold text-foreground">{{ data.kpis.satisfaction.target }}</b>, </span>
              <b :class="data.kpis.satisfaction.gap >= 0 ? 'text-[#20866a]' : 'text-sk-orange'" class="font-semibold">
                {{ data.kpis.satisfaction.gap >= 0 ? `목표 달성 (+${data.kpis.satisfaction.gap.toFixed(2)})` : `${Math.abs(data.kpis.satisfaction.gap).toFixed(2)}점 부족` }}
              </b>
            </span>
            <span v-else class="text-[#6f7684]">아직 만족도 응답이 없습니다</span>
          </template>
        </KpiCard>
        <KpiCard performance label="처리 기한 준수율" :value="data.kpis.ontime_rate.value" unit="%" note="14일 이내 완료 비율" :clickable="false"
          :formula="{ expr: '14일 이내 처리완료 ÷ 기간 내 처리완료 × 100', calc: rateCalc(data.kpis.ontime_rate) }" />
        <KpiCard performance label="처리 완료율" :value="data.kpis.completion_rate.value" unit="%" note="접수 건 대비 처리완료" :clickable="false"
          :formula="{ expr: '기간 내 처리완료 RMA ÷ 기간 내 접수 RMA × 100', calc: rateCalc(data.kpis.completion_rate) }" />
      </template>
      <template v-else><Skeleton v-for="i in 3" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>
  </KpiSection>

  <WidgetBoard v-model:editing="editing" dashboard="cs" :titles="titles">
    <template #byProduct>
      <Card :title="titles.byProduct" description="선택 기간 RMA가 많은 순, 만족도는 처리완료 고객 응답의 누적 평균 (5점 만점)" class="h-full">
        <Skeleton v-if="!data" class="h-48" />
        <ProductSatTable v-else :rows="topProducts" @select="(p) => toList({ product: p.product })" />
      </Card>
    </template>

    <template #lowSatisfaction>
      <Card :title="titles.lowSatisfaction" description="만족도 누적 평균이 낮은 순, 응답이 있는 제품만 (5점 만점)" class="h-full">
        <Skeleton v-if="!data" class="h-48" />
        <p v-else-if="!lowProducts.length" class="py-10 text-center text-sm text-muted-foreground">만족도 응답이 아직 없습니다</p>
        <ProductSatTable v-else low :rows="lowProducts" @select="(p) => toList({ product: p.product, status: '처리완료' }, false)" />
      </Card>
    </template>

    <template #statusDist>
      <Card :title="titles.statusDist" class="h-full">
        <template v-if="data" #actions><span class="text-xs text-muted-foreground">선택 기간 <b class="font-semibold text-foreground tabular">{{ statusTotal.toLocaleString() }}</b>건</span></template>
        <Skeleton v-if="!data" class="h-48" />
        <div v-else class="flex h-full flex-col gap-4">
          <!-- 상태별 칸: 누르면 그 상태의 RMA 목록 -->
          <div class="grid flex-1 grid-cols-4 gap-2.5">
            <button
              v-for="s in data.status_dist.status" :key="s.status"
              :class="s.count ? 'bg-[#fafbfc] hover:border-brand-line hover:bg-brand-soft/50' : 'bg-transparent opacity-60'"
              class="flex min-h-[112px] flex-col rounded-xl border border-[#eef0f3] p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              :title="STATUS_DESC[s.status]"
              @click="toList({ status: s.status })"
            >
              <span class="flex items-center gap-1.5 text-[13px] font-semibold"><i :class="STATUS_BAR[s.status]" class="inline-block size-2 rounded-full" />{{ STATUS_LABEL[s.status] || s.status }}</span>
              <span class="mt-auto pt-3 text-[26px] font-bold leading-none tabular">{{ s.count.toLocaleString() }}<small class="ml-0.5 text-[12px] font-normal text-[#6f7684]">건</small></span>
              <span class="mt-1.5 text-[12px] text-muted-foreground"><b class="font-semibold text-[#4a5160] tabular">{{ statusTotal ? Math.round((s.count / statusTotal) * 100) : 0 }}%</b>, {{ STATUS_DESC[s.status] }}</span>
            </button>
          </div>
          <!-- 상태 비율 막대 -->
          <div class="flex h-2 overflow-hidden rounded-full bg-chart-track">
            <i v-for="s in data.status_dist.status.filter((x) => x.count)" :key="s.status" :class="STATUS_BAR[s.status]" :style="{ width: (s.count / statusTotal) * 100 + '%' }" :title="`${STATUS_LABEL[s.status] || s.status} ${s.count}건`" />
          </div>
          <!-- 처리완료 건의 처분 유형 -->
          <div class="border-t border-[#f1f2f5] pt-3">
            <p class="mb-2 text-[12px] font-semibold text-muted-foreground">처분 유형 (처리완료 건)</p>
            <p v-if="!data.status_dist.disposition.length" class="text-xs text-muted-foreground">선택 기간에 처리완료 건이 없어 처분 유형이 없습니다</p>
            <div v-else class="flex flex-wrap gap-2">
              <button
                v-for="d in data.status_dist.disposition" :key="d.disposition"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] hover:border-brand-line hover:bg-brand-soft"
                @click="toList({ status: '처리완료' })"
              >{{ d.disposition }} <b class="font-semibold tabular">{{ d.count }}</b></button>
            </div>
          </div>
        </div>
      </Card>
    </template>

    <template #priority>
      <Card :title="titles.priority" :padded="false">
        <div class="px-5 pb-4 pt-3">
          <Skeleton v-if="!data" class="h-48" />
          <p v-else-if="!data.priority.length" class="py-10 text-center text-sm text-muted-foreground">현재 응대가 필요한 RMA가 없습니다</p>
          <table v-else class="w-full table-fixed text-left text-sm">
            <colgroup>
              <!-- 열을 표 전체 폭에 고르게 나눈다. 보고서 버튼은 마지막 열 왼쪽에 두어 오른쪽 끝에 붙지 않게 한다 -->
              <col class="w-[6%]" /><col class="w-[11%]" /><col class="w-[16%]" /><col class="w-[10%]" /><col class="w-[9%]" />
              <col class="w-[11%]" /><col class="w-[10%]" /><col class="w-[10%]" /><col class="w-[9%]" /><col class="w-[8%]" />
            </colgroup>
            <thead class="text-xs text-muted-foreground">
              <tr class="[&_th]:py-2 [&_th]:font-medium">
                <th>순위</th><th>RMA ID</th><th>제품 / 고객사</th><th>클레임 수량</th><th>경과일</th>
                <th class="text-center"><ImportanceTip /></th><th>상태</th><th><CsScoreTip /></th><th><SeverityTip /></th><th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in data.priority" :key="r.rma_id" class="cursor-pointer border-t hover:bg-muted/50 [&_td]:py-2.5" @click="router.push({ path: '/rmas', query: { open: r.rma_id } })">
                <td class="font-semibold tabular">{{ r.pinned ? '📌' : '' }}{{ i + 1 }}</td>
                <td class="font-medium">{{ r.rma_id }}</td>
                <td class="truncate" :title="`${r.product}, ${r.customer_name}`">{{ r.product }} <span class="text-muted-foreground">{{ r.customer_name }}</span></td>
                <td class="tabular">{{ r.claim_qty }}개</td>
                <td class="tabular" :class="r.elapsed_days > 7 ? 'font-medium text-orange-600' : ''">{{ r.elapsed_days }}일</td>
                <td class="text-center"><Badge :tone="IMPORTANCE_TONE[r.importance]">{{ r.importance }}</Badge></td>
                <td><Badge :tone="STATUS_TONE[r.status]">{{ STATUS_LABEL[r.status] || r.status }}</Badge></td>
                <td @click.stop><ScoreTip :score="r.score" :breakdown="r.breakdown" :pinned="r.pinned" /></td>
                <td><Badge :tone="SEVERITY_TONE[r.severity]">{{ r.severity }}</Badge></td>
                <td @click.stop><Button variant="outline" size="xs" @click="reportRma = r.rma_id; reportOpen = true"><FileText class="size-3" />보고서</Button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </template>

    <template #trend>
      <TrendWidget :title="titles.trend" :from="from" :to="to" y-label="RMA 접수건수 (건)" :chart-height="246" />
    </template>
  </WidgetBoard>

  <RmaReportDialog v-model:open="reportOpen" :rma-id="reportRma" />
</template>
