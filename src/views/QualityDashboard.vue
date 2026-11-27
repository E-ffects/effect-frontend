<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Banknote, Bell, Package, Repeat } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BarList from '@/components/charts/BarList.vue'
import DashboardHeader from '@/components/DashboardHeader.vue'
import KpiCard from '@/components/KpiCard.vue'
import KpiSection from '@/components/KpiSection.vue'
import RankList from '@/components/charts/RankList.vue'
import RiskTip from '@/components/RiskTip.vue'
import UrgencyTip from '@/components/UrgencyTip.vue'
import ScoreTip from '@/components/ScoreTip.vue'
import TrendWidget from '@/components/TrendWidget.vue'
import WidgetBoard from '@/components/WidgetBoard.vue'
import { api, fmtWon } from '@/lib/api'
import { SEVERITY_TONE, URGENCY_TONE } from '@/lib/badges'
import { deltaNum, deltaPct, deltaShort, rateCalc, tone } from '@/lib/format'
import { usePeriod } from '@/lib/meta'
import { reportLoadError } from '@/lib/state'

const router = useRouter()
const { from, to, apply } = usePeriod(30)
const data = ref(null)
const editing = ref(false)

const titles = { defectTop5: '불량 유형별 발생 TOP 5', repeatRank: '반복 불량 순위', priority: '품질 조치 우선순위 TOP 5', trend: '불량 발생 추이' }

watch(
  [from, to],
  async () => {
    data.value = null
    try {
      data.value = await api('/dashboard/quality', { query: { from: from.value, to: to.value } })
    } catch (e) {
      reportLoadError(e)
    }
  },
  { immediate: true },
)

const period = () => ({ from: from.value, to: to.value })
const toList = (q = {}) => router.push({ path: '/rmas', query: { ...period(), ...q } })
// 반복 조사·우선순위 행 → 그 조사의 대표 RMA 케이스 (Spring 응답 rma_id). 패턴 화면은 아직 숨김
const toCase = (rmaId) => rmaId && router.push(`/rmas/${rmaId}/case`)

function scrollToRepeat() {
  document.getElementById('w-repeat')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

</script>

<template>
  <DashboardHeader
    title="품질 대시보드" tagline="데이터로 발견하고, 근거로 개선하는 품질 관리" :crumb="false"
    :link="data?.priority[0]?.rma_id ? { label: `${data.priority[0].investigation_id} 대표 케이스 보기`, to: `/rmas/${data.priority[0].rma_id}/case` } : null"
    :from="from" :to="to" :editing="editing"
    @apply="apply" @edit="editing = true"
  />

  <!-- ⑤ KPI: 주요 현황 4 | 품질 성과 KPI 2 -->
  <KpiSection performance-label="품질 성과" :overview="4" :performance="2">
    <template #overview>
      <template v-if="data">
        <KpiCard label="총 RMA" :icon="Package" :value="data.kpis.total_rma.value" unit="건" :delta="deltaShort(data.kpis.total_rma.change_pct)" :delta-tone="tone(data.kpis.total_rma.change_pct)" note="직전 동기간 대비" @click="toList()" />
        <KpiCard label="반복 불량 패턴" :icon="Repeat" :value="data.kpis.repeat_patterns.value" unit="개" :delta="data.kpis.repeat_patterns.new ? `신규 ${data.kpis.repeat_patterns.new}` : ''" delta-tone="warn" note="같은 패턴 2건 이상 기준" @click="scrollToRepeat" />
        <KpiCard label="재발 의심" :icon="Bell" :value="data.kpis.recurrence_suspected.value" unit="건" :delta="data.kpis.recurrence_suspected.value ? '담당자 확인 필요' : ''" delta-tone="warn" note="재발 판정이 재발인 건" :clickable="false" />
        <KpiCard label="가정 단가 기반 추정 손실" :icon="Banknote" :value="fmtWon(data.kpis.loss.value)" :delta="deltaShort(data.kpis.loss.change_pct)" :delta-tone="tone(data.kpis.loss.change_pct)" note="선택 기간 발생분" @click="toList()" />
      </template>
      <template v-else><Skeleton v-for="i in 4" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>
    <template #performance>
      <template v-if="data">
        <KpiCard performance label="원인 확정률" :value="data.kpis.cause_confirm_rate.value" unit="%" note="원인이 기록된 사례 비율" :clickable="false"
          :formula="{ expr: '원인이 기록된 RMA ÷ 기간 내 접수 RMA × 100', calc: rateCalc(data.kpis.cause_confirm_rate) }" />
        <KpiCard performance label="대책 효과율" :value="data.kpis.countermeasure_effect_rate.value" unit="%" note="완료 대책 중 효과 확인 비율" :clickable="false"
          :formula="{ expr: '효과있고 재발 없는 대책 ÷ 기간 내 완료 대책 × 100', calc: rateCalc(data.kpis.countermeasure_effect_rate) }" />
      </template>
      <template v-else><Skeleton v-for="i in 2" :key="i" class="h-[112px] rounded-xl" /></template>
    </template>
  </KpiSection>

  <p v-if="data && !data.kpis.total_rma.value" class="mb-4 rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">선택한 기간에 등록된 RMA가 없습니다</p>

  <WidgetBoard v-model:editing="editing" dashboard="quality" :titles="titles">
    <template #defectTop5>
      <Card :title="titles.defectTop5" class="h-full">
        <Skeleton v-if="!data" class="h-48" />
        <BarList v-else :items="data.defect_top5.map((d) => ({ key: d.defect_type, label: d.defect_type, value: d.count }))" @select="(it) => toList({ defectType: it.key })" />
      </Card>
    </template>

    <template #repeatRank>
      <Card id="w-repeat" :title="titles.repeatRank" class="h-full" :padded="false">
        <template #actions>
        </template>
        <div class="px-5 pb-3 pt-1">
          <Skeleton v-if="!data" class="h-48" />
          <p v-else-if="!data.repeat_rank.length" class="py-10 text-center text-sm text-muted-foreground">2건 이상 반복된 불량이 없습니다</p>
          <RankList
            v-else
            compact
            :items="data.repeat_rank.slice(0, 5).map((r) => ({ ...r, key: r.investigation_id, hint: `${r.investigation_id} ${r.title || ''}, ${r.primary_cause || '원인 미정'}, 직전 기간 ${r.prev_count}건` }))"
            @select="(r) => toCase(r.rma_id)"
          >
            <template #title="{ item }">{{ item.product }} <span class="font-normal text-[#c4c8cf]">/</span> {{ item.defect_type }}</template>
          </RankList>
        </div>
      </Card>
    </template>

    <template #priority>
      <Card :title="titles.priority" :padded="false">
        <div class="overflow-x-auto px-5 pb-4 pt-3">
          <Skeleton v-if="!data" class="h-48" />
          <p v-else-if="!data.priority.length" class="py-10 text-center text-sm text-muted-foreground">선택한 기간에 등록된 RMA가 없습니다</p>
          <table v-else class="w-full min-w-[680px] text-left text-sm [&_td]:pr-4 [&_th]:pr-4">
            <thead class="text-xs text-muted-foreground">
              <tr>
                <th class="py-2 text-left font-medium">순위</th><th class="text-left font-medium">조사 / 제품</th><th class="text-left font-medium">불량 유형</th>
                <th class="text-left font-medium">발생</th><th class="text-left font-medium">가정 단가 기반 추정 손실</th><th class="text-left font-medium"><RiskTip /></th>
                <th class="text-left font-medium">점수</th><th class="text-left font-medium"><UrgencyTip /></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in data.priority" :key="r.investigation_id" class="cursor-pointer border-t hover:bg-muted/50" :title="r.title" @click="toCase(r.rma_id)">
                <td class="py-2.5 font-semibold tabular">{{ i + 1 }}</td>
                <td class="py-2.5"><span class="font-medium">{{ r.investigation_id }}</span> <span class="text-muted-foreground">{{ r.product }}</span></td>
                <td class="py-2.5">{{ r.defect_type }}</td>
                <td class="py-2.5 text-left tabular">{{ r.count }}건 <span class="text-xs text-muted-foreground">/ {{ r.defect_qty }}개</span></td>
                <td class="py-2.5 text-left tabular">{{ fmtWon(r.loss) }}</td>
                <td class="py-2.5">
                  <!-- 위험도는 하나만: 고위험(CRITICAL·재발·최근 급증)이면 고위험, 아니면 최고 심각도 -->
                  <Badge v-if="r.high_risk" tone="red" :title="`최고 심각도 ${r.top_severity}`">고위험</Badge>
                  <Badge v-else :tone="SEVERITY_TONE[r.top_severity]">{{ r.top_severity }}</Badge>
                </td>
                <td class="py-2.5 text-left" @click.stop><ScoreTip :score="r.score" :breakdown="r.breakdown" :evidence="r.evidence" /></td>
                <td class="py-2.5"><Badge :tone="URGENCY_TONE[r.urgency]">{{ r.urgency }}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </template>

    <template #trend>
      <TrendWidget :title="titles.trend" :from="from" :to="to" y-label="RMA 발생건수 (건)" />
    </template>
  </WidgetBoard>

</template>
