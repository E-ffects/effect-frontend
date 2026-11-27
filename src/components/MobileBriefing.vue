<script setup>
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Repeat, Sparkles } from 'lucide-vue-next'
import MotionStatCard from '@/components/motion/MotionStatCard.vue'
import MotionPager from '@/components/motion/MotionPager.vue'
import MarkerText from '@/components/motion/MarkerText.vue'
import { api, fmtWon, referenceDate } from '@/lib/api'
import { useMeta } from '@/lib/meta'

const props = defineProps({
  isCs: { type: Boolean, default: false },
})

const emit = defineEmits(['open-chat', 'open-tab'])
useMeta()

const loading = ref(true)
const slideIdx = ref(0)

// 실제 API 응답 데이터
const qa30 = ref(null)
const cs30 = ref(null)
const waitingOpen = ref([])
const trendPoints = ref([])

function shiftDate(baseStr, days) {
  const d = new Date(baseStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function toNormalizedSeries(points, sliceLen) {
  const src = points.slice(-sliceLen).map((p) => Number(p.count) || 0)
  if (!src.length) return [0.22, 0.3, 0.28, 0.4, 0.36, 0.48, 0.44, 0.54, 0.5, 0.62, 0.58, 0.68]
  const max = Math.max(...src, 1)
  return src.map((v) => 0.14 + (v / max) * 0.78)
}

const statRanges = computed(() => {
  const pts = trendPoints.value
  const total90 = pts.reduce((a, p) => a + (Number(p.count) || 0), 0)
  const total30 = props.isCs
    ? (cs30.value?.kpis?.received_count ?? pts.slice(-5).reduce((a, p) => a + (Number(p.count) || 0), 0))
    : (qa30.value?.kpis?.total_rma?.value ?? pts.slice(-5).reduce((a, p) => a + (Number(p.count) || 0), 0))
  const total7 = pts.slice(-2).reduce((a, p) => a + (Number(p.count) || 0), 0) || Math.round(total30 / 4)
  const change30 = props.isCs ? 0 : Number(qa30.value?.kpis?.total_rma?.change_pct ?? 0)

  return [
    { key: '7d', label: '최근 2주', value: total7, delta: +(change30 * 0.6).toFixed(1), pts: toNormalizedSeries(pts, 4) },
    { key: '30d', label: '최근 30일', value: total30, delta: change30, pts: toNormalizedSeries(pts, 8) },
    { key: '90d', label: '최근 90일', value: total90 || total30 * 3, delta: +(change30 * 1.2).toFixed(1), pts: toNormalizedSeries(pts, 14) },
  ]
})

const elapsed = (openedAt) =>
  Math.max(0, Math.round((new Date(referenceDate.value) - new Date(String(openedAt).slice(0, 10))) / 86400000))

// CS 계산 지표
const csOverdueCount = computed(() => waitingOpen.value.filter((r) => elapsed(r.opened_at) > 7).length)
const csSlaRate = computed(() => {
  const n = waitingOpen.value.length
  if (!n) return 100
  return Math.round(((n - csOverdueCount.value) / n) * 1000) / 10
})
const csClosureRate = computed(() => {
  const closed = cs30.value?.kpis?.closed_count || 0
  const pending = cs30.value?.kpis?.pending_count || 0
  const denom = closed + pending
  return denom ? Math.round((closed / denom) * 1000) / 10 : 100
})

// 브리핑 슬라이드 목록 (QA 3장 / CS 3장)
const slideCount = 3

const topPriority = computed(() => qa30.value?.priority?.[0] || null)
const topRepeat = computed(() => qa30.value?.repeat_rank?.[0] || null)
const oldestWaiting = computed(() => waitingOpen.value[0] || null)

let loadSeq = 0
async function loadBriefing() {
  const seq = ++loadSeq
  loading.value = true
  const to = referenceDate.value || new Date().toISOString().slice(0, 10)
  const from30 = shiftDate(to, -29)
  const from90 = shiftDate(to, -89)

  try {
    if (props.isCs) {
      const [csRes, trendRes, openRes] = await Promise.all([
        api('/dashboard/cs', { query: { from: from30, to } }).catch(() => null),
        api('/dashboard/trend', { query: { from: from90, to } }).catch(() => null),
        api('/rmas', { query: { status: 'OPEN', sort: 'opened_at:asc', page: 1, size: 50 } }).catch(() => null),
      ])
      if (seq !== loadSeq) return
      cs30.value = csRes
      trendPoints.value = trendRes?.points || []
      waitingOpen.value = openRes?.items || []
    } else {
      const [qaRes, trendRes] = await Promise.all([
        api('/dashboard/quality', { query: { from: from30, to } }).catch(() => null),
        api('/dashboard/trend', { query: { from: from90, to } }).catch(() => null),
      ])
      if (seq !== loadSeq) return
      qa30.value = qaRes
      trendPoints.value = trendRes?.points || []
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(referenceDate, () => loadBriefing(), { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-xl space-y-4 pb-6">
    <!-- 1. 오늘의 브리핑 요약 카드 (MarkerText 강조) -->
    <section class="rounded-[24px] border border-white/12 bg-[#0b0f1f]/94 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.4)]">
      <div class="flex items-center gap-2 text-[11.5px] font-medium text-cyan-300">
        <Sparkles class="size-3.5" />
        <span>오늘의 {{ isCs ? 'CS' : '품질' }} 브리핑</span>
        <span class="ml-auto text-[#b9becf]/60">{{ referenceDate }}</span>
      </div>

      <div v-if="loading" class="mt-3 space-y-2">
        <div class="h-4 w-4/5 animate-pulse rounded bg-white/10" />
        <div class="h-4 w-3/5 animate-pulse rounded bg-white/10" />
      </div>

      <!-- QA 브리핑 문장 -->
      <p v-else-if="!isCs" class="mt-2.5 text-[15px] leading-[1.7] text-[#eef0f6]">
        최근 30일 기준 확인이 필요한
        <MarkerText color="rgba(251, 113, 133, 0.36)" :delay="180">
          <b class="font-semibold text-white">재발 의심 {{ qa30?.kpis?.recurrence_suspected?.value ?? 0 }}건</b>
        </MarkerText>과
        <MarkerText color="rgba(167, 139, 250, 0.36)" :delay="480">
          <b class="font-semibold text-white">반복 패턴 {{ qa30?.kpis?.repeat_patterns?.value ?? 0 }}개</b>
        </MarkerText>가 탐지되었습니다.
        현재 원인 확정률은
        <MarkerText type="underline" color="#38bdf8" :delay="780">
          <b class="font-semibold text-cyan-200">{{ qa30?.kpis?.cause_confirm_rate?.value ?? 0 }}%</b>
        </MarkerText>입니다.
      </p>

      <!-- CS 브리핑 문장 -->
      <p v-else class="mt-2.5 text-[15px] leading-[1.7] text-[#eef0f6]">
        현재 고객 회신을 기다리는 건은
        <MarkerText color="rgba(56, 189, 248, 0.36)" :delay="180">
          <b class="font-semibold text-white">미회신 {{ waitingOpen.length }}건</b>
        </MarkerText>이며,
        7일 초과 지연은
        <MarkerText color="rgba(251, 146, 60, 0.38)" :delay="480">
          <b class="font-semibold text-white">{{ csOverdueCount }}건</b>
        </MarkerText>입니다.
        7일 응대 준수율은
        <MarkerText type="underline" color="#34d17a" :delay="780">
          <b class="font-semibold text-emerald-300">{{ csSlaRate }}%</b>
        </MarkerText>입니다.
      </p>
    </section>

    <!-- 2. DesignBookmark Stat Card (스프링 스파크라인 그래프) -->
    <MotionStatCard
      :label="isCs ? 'RMA 반품 접수 추이' : 'RMA 불량 발생 추이'"
      unit="건"
      :accent="isCs ? '#38bdf8' : '#34d17a'"
      :ranges="statRanges"
      :initial-index="1"
    />

    <!-- 3. DesignBookmark Pagination Dots (스와이프 핵심 브리핑 카드 덱) -->
    <div>
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="text-[12px] font-medium text-[#b9becf]">핵심 확인 카드 (좌우 스와이프)</span>
        <span class="text-[11px] text-[#b9becf]/65">{{ slideIdx + 1 }} / {{ slideCount }}</span>
      </div>

      <MotionPager v-model="slideIdx" :count="slideCount">
        <!-- ========= QA 브리핑 슬라이드 3장 ========= -->
        <template v-if="!isCs">
          <!-- 슬라이드 1: 조치 우선순위 1위 -->
          <div class="w-full shrink-0 pr-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#161229]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-rose-400/35 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-medium text-rose-200">
                    <AlertTriangle class="size-3" />조치 우선순위 1위
                  </span>
                  <span v-if="topPriority" class="text-[11.5px] text-[#b9becf]">점수 {{ topPriority.score }}</span>
                </div>
                <h3 class="mt-3 text-[17px] font-semibold text-white">
                  {{ topPriority ? `${topPriority.product} · ${topPriority.defect_type}` : '우선순위 이슈 없음' }}
                </h3>
                <p v-if="topPriority" class="mt-1.5 text-[13px] leading-relaxed text-[#b9becf]">
                  최근 {{ topPriority.count }}건 발생 · 추정 손실
                  <MarkerText color="rgba(251, 113, 133, 0.32)" :delay="300">
                    <b class="text-white">{{ fmtWon(topPriority.loss) }}</b>
                  </MarkerText>
                </p>
              </div>
              <div class="mt-4 flex items-center justify-between">
                <span class="text-[11.5px] text-[#b9becf]/70">{{ topPriority?.rma_id || '' }}</span>
                <button
                  v-if="topPriority?.rma_id"
                  class="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-[#1c1d22] transition active:scale-95"
                  @click="emit('open-chat', { type: 'RMA', id: topPriority.rma_id, label: topPriority.rma_id })"
                >
                  <Sparkles class="size-3.5" />AI 원인 분석
                </button>
              </div>
            </div>
          </div>

          <!-- 슬라이드 2: 최다 반복 불량 -->
          <div class="w-full shrink-0 px-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#101c33]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
                    <Repeat class="size-3" />최다 반복 불량
                  </span>
                  <span v-if="topRepeat" class="text-[11.5px] text-[#b9becf]">{{ topRepeat.count }}건 반복</span>
                </div>
                <h3 class="mt-3 text-[17px] font-semibold text-white">
                  {{ topRepeat ? `${topRepeat.product} / ${topRepeat.defect_type}` : '반복 불량 없음' }}
                </h3>
                <p v-if="topRepeat" class="mt-1.5 text-[13px] leading-relaxed text-[#b9becf]">
                  추정 원인: <b class="text-white/90">{{ topRepeat.primary_cause || '원인 분석 중' }}</b>
                </p>
              </div>
              <div class="mt-4 flex items-center justify-between">
                <span class="text-[11.5px] text-[#b9becf]/70">{{ topRepeat?.investigation_id || '' }}</span>
                <button
                  class="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-[#1c1d22] transition active:scale-95"
                  @click="emit('open-tab', 'patterns')"
                >
                  불량 패턴 보기 <ArrowRight class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- 슬라이드 3: 품질 성과 KPI -->
          <div class="w-full shrink-0 pl-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#0e2029]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-medium text-cyan-200">
                <CheckCircle2 class="size-3" />품질 성과 KPI
              </span>
              <div class="mt-3 grid grid-cols-2 gap-2.5">
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p class="text-[11.5px] text-[#b9becf]">원인 확정률</p>
                  <p class="mt-1 text-[24px] font-semibold text-white tabular-nums">
                    {{ qa30?.kpis?.cause_confirm_rate?.value ?? 0 }}<span class="text-sm text-[#b9becf]">%</span>
                  </p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p class="text-[11.5px] text-[#b9becf]">추정 손실</p>
                  <p class="mt-1 text-[20px] font-semibold text-white tabular-nums">
                    {{ fmtWon(qa30?.kpis?.loss?.value ?? 0) }}
                  </p>
                </div>
              </div>
              <div class="mt-3 flex justify-end">
                <button
                  class="inline-flex items-center gap-1 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs font-medium text-white"
                  @click="emit('open-tab', 'approvals')"
                >
                  원인 판정 대기 확인 <ArrowRight class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- ========= CS 브리핑 슬라이드 3장 ========= -->
        <template v-else>
          <!-- 슬라이드 1: 가장 오래 대기 중인 고객사 -->
          <div class="w-full shrink-0 pr-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#231518]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                    <Clock class="size-3" />최우선 고객 회신
                  </span>
                  <span v-if="oldestWaiting" class="text-[11.5px] font-medium text-amber-300">
                    {{ elapsed(oldestWaiting.opened_at) }}일 경과
                  </span>
                </div>
                <h3 class="mt-3 text-[17px] font-semibold text-white">
                  {{ oldestWaiting ? `${oldestWaiting.customer_name || '고객사'} · ${oldestWaiting.rma_id}` : '회신 대기 건 없음' }}
                </h3>
                <p v-if="oldestWaiting" class="mt-1.5 text-[13px] text-[#b9becf]">
                  {{ oldestWaiting.reported_part_no }} · {{ oldestWaiting.minor_name || oldestWaiting.defect_type || '유형 확인 중' }}
                </p>
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  v-if="oldestWaiting"
                  class="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-[#1c1d22] transition active:scale-95"
                  @click="emit('open-chat', { type: 'RMA', id: oldestWaiting.rma_id, label: oldestWaiting.rma_id })"
                >
                  <Sparkles class="size-3.5" />AI 고객 안내 작성
                </button>
              </div>
            </div>
          </div>

          <!-- 슬라이드 2: CS 성과 KPI -->
          <div class="w-full shrink-0 px-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#0e2029]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200">
                <CheckCircle2 class="size-3" />CS 성과 KPI
              </span>
              <div class="mt-3 grid grid-cols-2 gap-2.5">
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p class="text-[11.5px] text-[#b9becf]">7일 응대 준수율</p>
                  <p class="mt-1 text-[24px] font-semibold text-white tabular-nums">
                    {{ csSlaRate }}<span class="text-sm text-[#b9becf]">%</span>
                  </p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p class="text-[11.5px] text-[#b9becf]">CS 처리 완료율</p>
                  <p class="mt-1 text-[24px] font-semibold text-white tabular-nums">
                    {{ csClosureRate }}<span class="text-sm text-[#b9becf]">%</span>
                  </p>
                </div>
              </div>
              <p class="mt-2 text-[11.5px] text-[#b9becf]/75">목표 기준: 7일 SLA ≥ 90% · 처리 완료율 ≥ 80%</p>
            </div>
          </div>

          <!-- 슬라이드 3: 처리 현황 요약 -->
          <div class="w-full shrink-0 pl-0.5">
            <div class="flex min-h-[196px] flex-col justify-between rounded-[24px] border border-white/12 bg-gradient-to-br from-[#141730]/90 via-[#0d1022]/90 to-[#0a0d1a]/95 p-4">
              <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-medium text-cyan-200">
                최근 30일 처리 현황
              </span>
              <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] py-2.5">
                  <p class="text-[11px] text-[#b9becf]">접수</p>
                  <p class="mt-0.5 text-[18px] font-semibold text-white tabular-nums">{{ cs30?.kpis?.received_count ?? 0 }}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] py-2.5">
                  <p class="text-[11px] text-[#b9becf]">처리 중</p>
                  <p class="mt-0.5 text-[18px] font-semibold text-amber-200 tabular-nums">{{ cs30?.kpis?.pending_count ?? 0 }}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] py-2.5">
                  <p class="text-[11px] text-[#b9becf]">완료</p>
                  <p class="mt-0.5 text-[18px] font-semibold text-emerald-300 tabular-nums">{{ cs30?.kpis?.closed_count ?? 0 }}</p>
                </div>
              </div>
              <div class="mt-3 flex justify-end">
                <button
                  class="inline-flex items-center gap-1 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs font-medium text-white"
                  @click="emit('open-tab', 'rmas')"
                >
                  RMA 조회로 이동 <ArrowRight class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </MotionPager>
    </div>
  </div>
</template>
