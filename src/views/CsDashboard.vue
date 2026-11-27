<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, ChevronRight, Clock, Inbox, Wallet } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import DateRange from '@/components/ui/DateRange.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BarList from '@/components/charts/BarList.vue'
import KpiCard from '@/components/KpiCard.vue'
import KpiSection from '@/components/KpiSection.vue'
import PageHead from '@/components/PageHead.vue'
import TrendWidget from '@/components/TrendWidget.vue'
import { api, fmtDate, fmtWon, referenceDate } from '@/lib/api'
import { usePeriod } from '@/lib/meta'
import { reportLoadError } from '@/lib/state'
import { CS_STATUS, LEVEL_TONE, pick } from '@/lib/caseLabels'

// 고객대응 대시보드 (Spring GET /api/dashboard/cs + /api/dashboard/trend + /api/rmas, CS 전용)
const router = useRouter()
const { from, to, apply } = usePeriod(30)
const data = ref(null)
const periodRmas = ref(null)
const waiting = ref(null)

watch(
  [from, to],
  async () => {
    data.value = null
    periodRmas.value = null
    try {
      const [csRes, listRes] = await Promise.all([
        api('/dashboard/cs', { query: { from: from.value, to: to.value } }),
        api('/rmas', { query: { from: from.value, to: to.value, page: 1, size: 100 } }).catch(() => ({ items: [] })),
      ])
      data.value = csRes
      periodRmas.value = listRes?.items || []
    } catch (e) {
      reportLoadError(e)
    }
  },
  { immediate: true },
)

async function loadWaiting() {
  try {
    waiting.value = await api('/rmas', { query: { status: 'OPEN', sort: 'opened_at:asc', page: 1, size: 50 } })
  } catch (e) {
    reportLoadError(e)
    waiting.value = { items: [], total: 0 }
  }
}
loadWaiting()

// 기준일(시연 2025-12-31)부터 접수일까지 지난 날 수
const elapsed = (openedAt) => Math.max(0, Math.round((new Date(referenceDate.value) - new Date(String(openedAt).slice(0, 10))) / 86400000))
const toList = (query) => router.push({ path: '/rmas', query })

// CS 성과 KPI 1: 처리 완료율 (기간 내 종료 ÷ (종료 + 현재 처리 중))
const closureRate = computed(() => {
  if (!data.value) return null
  const closed = data.value.kpis.closed_count || 0
  const pending = data.value.kpis.pending_count || 0
  const denom = closed + pending
  const pct = denom ? Math.round((closed / denom) * 1000) / 10 : 100
  return { value: pct, calc: `${closed.toLocaleString()}건 ÷ ${denom.toLocaleString()}건 × 100` }
})

// CS 성과 KPI 2: 7일 이내 응대 SLA 준수율 (미회신 건 중 7일 이하 경과 비율)
const slaRate = computed(() => {
  if (!waiting.value) return null
  const items = waiting.value.items || []
  const total = items.length
  if (!total) return { value: 100, overdue: 0, calc: '미회신 대기 건 없음 (100%)' }
  const within = items.filter((r) => elapsed(r.opened_at) <= 7).length
  const overdue = total - within
  const pct = Math.round((within / total) * 1000) / 10
  return { value: pct, overdue, calc: `7일 이내 ${within}건 ÷ 미회신 ${total}건 × 100` }
})

// 고객사별 접수 TOP 5
const customerTop5 = computed(() => {
  if (!periodRmas.value) return null
  const counts = new Map()
  for (const r of periodRmas.value) {
    const name = r.customer_name || '미지정 고객사'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ key: label, label, value }))
})

// CS 처리 상태별 분포
const statusBreakdown = computed(() => {
  if (!periodRmas.value) return null
  const order = ['OPEN', 'REPLIED', 'CLOSED']
  const counts = { OPEN: 0, REPLIED: 0, CLOSED: 0 }
  for (const r of periodRmas.value) {
    const st = r.cs_status || 'OPEN'
    counts[st] = (counts[st] || 0) + 1
  }
  return order.map((code) => ({
    key: code,
    label: pick(CS_STATUS, code).label,
    value: counts[code] || 0,
  }))
})
</script>

<template>
  <PageHead :crumb="false" title="고객대응 대시보드" description="고객의 문제를 더 빠르고 정확하게 해결하세요.">
    <template #actions>
      <DateRange :from="from" :to="to" @apply="apply" />
    </template>
  </PageHead>

  <!-- KPI: 주요 현황 4 | CS 성과 KPI 2 (품질 대시보드와 동일한 2-그룹 레이아웃) -->
  <KpiSection performance-label="CS 성과" :overview="4" :performance="2">
    <template #overview>
      <template v-if="data">
        <KpiCard
          label="접수" :icon="Inbox" :value="data.kpis.received_count.toLocaleString()" unit="건" note="선택 기간에 접수된 RMA"
          @click="toList({ from, to })"
        />
        <KpiCard
          label="처리 중" :icon="Clock" :value="data.kpis.pending_count.toLocaleString()" unit="건" note="지금 종료되지 않은 전체 RMA"
          :clickable="false"
          :formula="{ expr: '처리 상태가 처리 완료(CLOSED)가 아닌 RMA 수', note: '회신 전(접수)과 회신 후 처리 대기(회신 완료)를 함께 셉니다.' }"
        />
        <KpiCard
          label="처리 종료" :icon="CheckCircle2" :value="data.kpis.closed_count.toLocaleString()" unit="건" note="선택 기간에 처리 완료된 RMA"
          :clickable="false"
          :formula="{ expr: '처리 실행(service_action.executed_at)이 선택 기간에 있는 종료 RMA 수' }"
        />
        <KpiCard
          label="추정 손실" :icon="Wallet" :value="fmtWon(data.kpis.estimated_loss_krw)" note="가정 단가 기반 추정 손실" :clickable="false"
          :formula="{ expr: '선택 기간에 발생한 손실(loss_ledger.occurred_at) 합계', note: '실제 금액이 아니라 가정 단가로 계산한 추정값입니다.' }"
        />
      </template>
      <template v-else><Skeleton v-for="i in 4" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>

    <template #performance>
      <template v-if="closureRate && slaRate">
        <KpiCard
          performance
          label="CS 처리 완료율"
          :value="closureRate.value"
          unit="%"
          note="진행·완료 대비 종결 비율"
          :clickable="false"
          :formula="{ expr: '기간 내 처리 종료 ÷ (기간 내 처리 종료 + 미종료) × 100', calc: closureRate.calc }"
        />
        <KpiCard
          performance
          label="7일 응대 준수율"
          :value="slaRate.value"
          unit="%"
          :delta="slaRate.overdue ? `7일 초과 ${slaRate.overdue}건` : '지연 없음'"
          :delta-tone="slaRate.overdue ? 'warn' : 'good'"
          note="미회신 건 7일 SLA 기준"
          :clickable="false"
          :formula="{ expr: '미회신 중 7일 이내 건수 ÷ 전체 미회신 건수 × 100', calc: slaRate.calc, note: '접수일로부터 7일 이내 1차 회신을 목표로 측정합니다.' }"
        />
      </template>
      <template v-else><Skeleton v-for="i in 2" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>
  </KpiSection>

  <!-- 차트 영역: 주간 접수 추이 + 고객사별 TOP 5 -->
  <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <TrendWidget title="주간 반품 접수 추이" :from="from" :to="to" y-label="RMA 접수건수 (건)" />
    <Card title="고객사별 반품 접수 TOP 5" class="h-full">
      <Skeleton v-if="!customerTop5" class="h-48" />
      <p v-else-if="!customerTop5.length" class="py-12 text-center text-sm text-muted-foreground">선택한 기간에 접수된 RMA가 없습니다</p>
      <BarList v-else :items="customerTop5" @select="(it) => toList({ from, to, q: it.key })" />
    </Card>
  </div>

  <!-- 하단 영역: CS 처리 상태별 현황 + 응대가 필요한 RMA -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
    <Card title="처리 상태별 현황" class="h-full">
      <Skeleton v-if="!statusBreakdown" class="h-40" />
      <BarList v-else :items="statusBreakdown" @select="(it) => toList({ from, to, status: it.key })" />
    </Card>

    <Card title="응대가 필요한 RMA" description="아직 고객에게 회신하지 않은 건, 오래된 순" :padded="false">
      <template #actions>
        <button
          type="button" class="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          @click="toList({ status: 'OPEN', sort: 'opened_at:asc' })"
        >전체 {{ waiting?.total ?? '' }}건 보기<ChevronRight class="size-3.5" /></button>
      </template>
      <div class="overflow-x-auto px-5 pb-4 pt-1">
        <Skeleton v-if="!waiting" class="h-40" />
        <p v-else-if="!waiting.items.length" class="py-10 text-center text-sm text-muted-foreground">회신을 기다리는 RMA가 없습니다</p>
        <table v-else class="w-full min-w-[640px] table-fixed text-left text-sm">
          <colgroup><col class="w-[15%]" /><col class="w-[12%]" /><col class="w-[21%]" /><col class="w-[19%]" /><col class="w-[8%]" /><col class="w-[9%]" /><col class="w-[16%]" /></colgroup>
          <thead class="text-xs text-muted-foreground">
            <tr class="[&_th]:py-2 [&_th]:font-medium"><th>RMA ID</th><th>접수일</th><th>고객사</th><th>제품 · 불량</th><th>수량</th><th>수준</th><th>경과</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="r in waiting.items.slice(0, 6)" :key="r.rma_id" tabindex="0"
              class="cursor-pointer border-t hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none [&_td]:py-2.5"
              @click="router.push(`/rmas/${r.rma_id}/case`)" @keydown.enter="router.push(`/rmas/${r.rma_id}/case`)"
            >
              <td class="font-medium">{{ r.rma_id }}</td>
              <td class="tabular">{{ fmtDate(r.opened_at) }}</td>
              <td class="truncate" :title="r.customer_name">{{ r.customer_name }}</td>
              <td class="truncate" :title="`${r.reported_part_no} ${r.minor_name || ''}`">{{ r.reported_part_no }} <span class="text-muted-foreground">{{ r.minor_name || '' }}</span></td>
              <td class="tabular">{{ r.claimed_defect_qty }}</td>
              <td><Badge v-if="r.analysis_level" :tone="LEVEL_TONE[r.analysis_level]">{{ r.analysis_level }}</Badge><span v-else class="text-muted-foreground">—</span></td>
              <td class="tabular" :class="elapsed(r.opened_at) > 7 ? 'font-medium text-orange-600' : ''">{{ elapsed(r.opened_at) }}일 <Badge class="ml-1" :tone="pick(CS_STATUS, r.cs_status).tone">{{ pick(CS_STATUS, r.cs_status).label }}</Badge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>
