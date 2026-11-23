<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, ChevronRight, Clock, Inbox, Wallet } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import DateRange from '@/components/ui/DateRange.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import KpiCard from '@/components/KpiCard.vue'
import PageHead from '@/components/PageHead.vue'
import { api, fmtDate, fmtWon, referenceDate } from '@/lib/api'
import { usePeriod } from '@/lib/meta'
import { reportLoadError } from '@/lib/state'
import { CS_STATUS, LEVEL_TONE, pick } from '@/lib/caseLabels'

// 고객대응 대시보드 (Spring GET /api/dashboard/cs, CS 전용)
// - kpis: received_count(기간 내 접수), pending_count(현재 미종료), closed_count(기간 내 처리 종료), estimated_loss_krw
// - 응대가 필요한 RMA: GET /api/rmas?status=OPEN 오래된 순 (회신 전 건)
const router = useRouter()
const { from, to, apply } = usePeriod(30)
const data = ref(null)
const waiting = ref(null)

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

async function loadWaiting() {
  try {
    waiting.value = await api('/rmas', { query: { status: 'OPEN', sort: 'opened_at:asc', page: 1, size: 5 } })
  } catch (e) {
    reportLoadError(e)
    waiting.value = { items: [], total: 0 }
  }
}
loadWaiting()

// 기준일(시연 2025-12-31)부터 접수일까지 지난 날 수
const elapsed = (openedAt) => Math.max(0, Math.round((new Date(referenceDate.value) - new Date(String(openedAt).slice(0, 10))) / 86400000))
const toList = (query) => router.push({ path: '/rmas', query })
</script>

<template>
  <PageHead :crumb="false" title="고객대응 대시보드" description="고객의 문제를 더 빠르고 정확하게 해결하세요.">
    <template #actions>
      <DateRange :from="from" :to="to" @apply="apply" />
    </template>
  </PageHead>

  <section class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="주요 현황">
    <template v-if="data">
      <KpiCard
        label="접수" :icon="Inbox" :value="data.kpis.received_count.toLocaleString()" unit="건" note="선택 기간에 접수된 RMA"
        @click="toList({ from, to })"
      />
      <KpiCard
        label="처리 중" :icon="Clock" :value="data.kpis.pending_count.toLocaleString()" unit="건" note="지금 종료되지 않은 전체 RMA (기간과 무관)"
        :clickable="false"
        :formula="{ expr: '처리 상태가 처리 완료(CLOSED)가 아닌 RMA 수', note: '회신 전(접수)과 회신 후 처리 대기(회신 완료)를 함께 셉니다.' }"
      />
      <KpiCard
        label="처리 종료" :icon="CheckCircle2" :value="data.kpis.closed_count.toLocaleString()" unit="건" note="선택 기간에 처리를 실행해 종료한 RMA"
        :clickable="false"
        :formula="{ expr: '처리 실행(service_action.executed_at)이 선택 기간에 있는 종료 RMA 수' }"
      />
      <KpiCard
        label="추정 손실" :icon="Wallet" :value="fmtWon(data.kpis.estimated_loss_krw)" note="가정 단가 기반 추정 손실" :clickable="false"
        :formula="{ expr: '선택 기간에 발생한 손실(loss_ledger.occurred_at) 합계', note: '실제 금액이 아니라 가정 단가로 계산한 추정값입니다.' }"
      />
    </template>
    <template v-else><Skeleton v-for="i in 4" :key="i" class="h-[112px] rounded-xl" /></template>
  </section>

  <Card title="응대가 필요한 RMA" description="아직 고객에게 회신하지 않은 건, 오래된 순" :padded="false">
    <template #actions>
      <button
        type="button" class="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        @click="toList({ status: 'OPEN', sort: 'opened_at:asc' })"
      >전체 {{ waiting?.total ?? '' }}건 보기<ChevronRight class="size-3.5" /></button>
    </template>
    <div class="px-5 pb-4 pt-1">
      <Skeleton v-if="!waiting" class="h-40" />
      <p v-else-if="!waiting.items.length" class="py-10 text-center text-sm text-muted-foreground">회신을 기다리는 RMA가 없습니다</p>
      <table v-else class="w-full table-fixed text-left text-sm">
        <colgroup><col class="w-[14%]" /><col class="w-[12%]" /><col class="w-[22%]" /><col class="w-[18%]" /><col class="w-[10%]" /><col class="w-[10%]" /><col class="w-[14%]" /></colgroup>
        <thead class="text-xs text-muted-foreground">
          <tr class="[&_th]:py-2 [&_th]:font-medium"><th>RMA ID</th><th>접수일</th><th>고객사</th><th>제품 · 불량</th><th>수량</th><th>수준</th><th>경과</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="r in waiting.items" :key="r.rma_id" tabindex="0"
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
</template>
