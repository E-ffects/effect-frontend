<script setup>
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import CauseLocation from '@/components/case/CauseLocation.vue'
import { fmtDate } from '@/lib/api'
import { EVIDENCE, RECURRENCE, pick } from '@/lib/caseLabels'

// 케이스의 OUTPUT (품질관리자): 원인 분석·유사 사례·생산 이력·영향 Lot·재발·개선 탭. AI 명세 3-3 result를 그대로 그린다
const props = defineProps({ result: Object, trace: Array })
const r = computed(() => props.result || {})
const candidates = computed(() => r.value.cause_candidates || [])
const checks = computed(() => Object.fromEntries((r.value.qa_review?.candidate_checks || []).map((c) => [c.rank, c])))
const STATUS = { SUFFICIENT: { label: '근거 충분', tone: 'green' }, PARTIAL: { label: '일부 충족', tone: 'yellow' }, INSUFFICIENT: { label: '근거 부족', tone: 'gray' } }

// 생산 이력: 원인 후보·유출 원인의 근거 중 생산·검사 기록(유사 사례 제외)을 모은다
const lotSignals = computed(() => {
  const seen = new Set()
  const out = []
  for (const e of [...candidates.value.flatMap((c) => c.evidence || []), ...(r.value.escape_candidates || []).flatMap((x) => x.evidence || [])]) {
    if (e.type === 'SIMILAR_CASE' || seen.has(e.summary)) continue
    seen.add(e.summary)
    out.push(e)
  }
  return out
})
const lotTrace = computed(() => (props.trace || []).find((t) => t.agent === 'MANUFACTURING')?.action)

const lots = computed(() => r.value.candidate_lots || { items: [], total: 0 })
const showAllLots = ref(false)
const lotRows = computed(() => (showAllLots.value ? lots.value.items : lots.value.items.slice(0, 6)))
const sharedText = (it) => {
  const s = it.shared?.[0]
  if (!s) return '—'
  return s.type === 'EQUIPMENT' ? `${s.process_name} ${s.equipment_id} · ${s.gap_hours}h 차` : `자재 ${s.material_lot_id}`
}

const rec = computed(() => r.value.recurrence_check)
const improvement = computed(() => r.value.drafts?.improvement || {})
const card = 'rounded-[14px] border bg-card p-5'

// 분석 결과는 탭으로 나눈다 (원인 판정 카드는 CaseView에서 탭 위에 고정)
const TABS = computed(() => [
  { key: 'cause', label: '원인 분석', sub: '원인 후보 · 위치', note: `후보 ${candidates.value.length}` },
  { key: 'similar', label: '유사 사례', sub: '같은 증상 과거 사례', note: `${r.value.similar_cases?.length || 0}건` },
  { key: 'lot', label: '생산 이력', sub: 'Lot · 공정 기록', note: `이상 신호 ${lotSignals.value.length}` },
  { key: 'impact', label: '영향 Lot', sub: '같은 설비 · 자재', note: `${lots.value.total}개` },
  { key: 'recur', label: '재발·개선', sub: '재발 판정 · 개선안', note: rec.value ? pick(RECURRENCE, rec.value.status).label : '-' },
])
const tab = ref('cause')
</script>

<template>
  <div class="grid gap-4">
    <!-- 회색 트랙 위 세그먼트 탭: 선택된 탭만 흰 카드로 떠 보이게 -->
    <nav role="tablist" aria-label="분석 결과" class="seg grid grid-cols-5">
      <button
        v-for="t in TABS" :key="t.key" role="tab" :aria-selected="tab === t.key"
        class="seg-item min-w-0 px-3 py-2.5 text-left"
        @click="tab = t.key"
      >
        <span class="flex items-baseline gap-1.5 whitespace-nowrap">
          <span class="text-sm font-bold">{{ t.label }}</span>
          <span :class="tab === t.key ? 'text-primary' : ''" class="truncate text-xs font-semibold tabular">{{ t.note }}</span>
        </span>
        <span class="mt-0.5 block truncate text-[11px] font-medium opacity-70">{{ t.sub }}</span>
      </button>
    </nav>

    <!-- 원인 분석: 원인 위치(그림만) + 원인 후보 -->
    <CauseLocation v-if="candidates.length && tab === 'cause'" :result="r" compact />

    <!-- 원인 후보 -->
    <section v-show="tab === 'cause'" :class="card">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">원인 후보</h3>
        <span class="ml-auto text-xs text-muted-foreground">과거 확정·추정 사례 대조 · 상태: 제시</span>
      </header>
      <div>
        <ol class="mt-3 grid gap-2">
          <li v-for="c in candidates" :key="c.cause_code" :class="c.rank === 1 ? 'border-brand-line bg-brand-soft/60' : ''" class="rounded-lg border p-3.5">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span :class="c.rank === 1 ? 'text-primary' : 'text-muted-foreground'" class="text-sm font-bold tabular">{{ c.rank }}</span>
              <b class="text-[15px] font-semibold">{{ c.cause_name }}</b>
              <span class="text-sm text-muted-foreground">{{ c.process_name }}<template v-if="c.equipment_id"> · {{ c.equipment_id }}</template></span>
              <span class="ml-auto flex items-center gap-2">
                <span class="h-1.5 w-20 rounded-full bg-muted"><span class="block h-1.5 rounded-full" :class="c.rank === 1 ? 'bg-primary' : 'bg-[#9aa1ad]'" :style="{ width: Math.round(c.score * 100) + '%' }" /></span>
                <span class="w-9 text-right text-xs font-semibold tabular">{{ c.score.toFixed(2) }}</span>
                <Badge v-if="checks[c.rank]" :tone="pick(STATUS, checks[c.rank].evidence_status).tone">{{ pick(STATUS, checks[c.rank].evidence_status).label }}</Badge>
              </span>
            </div>
            <p class="mt-1.5 text-sm leading-relaxed text-[#3b404a]">{{ c.explanation }}</p>
            <ul v-if="c.evidence?.length" class="mt-2 grid gap-1">
              <li v-for="e in c.evidence" :key="e.ref_id + e.summary" class="flex items-baseline gap-2 text-xs">
                <Badge :tone="pick(EVIDENCE, e.type).tone">{{ pick(EVIDENCE, e.type).label }}</Badge>
                <span class="text-[#3b404a]">{{ e.summary }}</span>
              </li>
            </ul>
            <p v-if="checks[c.rank]?.missing?.length" class="mt-2 text-xs text-[#a8711a]">부족한 근거: {{ checks[c.rank].missing.join(', ') }}</p>
          </li>
        </ol>
        <div v-if="r.qa_review" class="mt-3 rounded-lg bg-muted/60 p-3.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <b class="text-sm font-semibold">QA 검토</b>
            <Badge v-if="r.qa_review.needs_approval" tone="red">승인 필요</Badge>
            <Badge v-for="a in r.qa_review.approval_reasons" :key="a" tone="outline">{{ a }}</Badge>
          </div>
          <p class="mt-1.5 text-sm leading-relaxed text-[#3b404a]">{{ r.qa_review.review_note }}</p>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-4">
      <!-- 생산 이력: Lot 이력·이상 신호 -->
      <section v-show="tab === 'lot'" :class="card">
        <header class="flex items-center gap-2">
          <h3 class="text-[15px] font-bold">Lot 이력 · 이상 신호</h3>
        </header>
        <div>
          <p v-if="r.trace_summary" class="mt-2 text-sm"><b class="font-semibold tabular">{{ r.trace_summary.lot_id }}</b> <span class="text-muted-foreground">· {{ r.trace_summary.spec_id }} · {{ r.trace_summary.part_no }}</span></p>
          <p v-if="lotTrace" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ lotTrace }}</p>
          <ul class="mt-3 grid gap-1.5">
            <li v-for="e in lotSignals" :key="e.summary" class="flex items-baseline gap-2 text-xs">
              <Badge :tone="pick(EVIDENCE, e.type).tone">{{ pick(EVIDENCE, e.type).label }}</Badge>
              <span class="text-[#3b404a]">{{ e.summary }}</span>
              <span class="ml-auto shrink-0 text-muted-foreground tabular">{{ fmtDate(e.occurred_at) }}</span>
            </li>
            <li v-if="!lotSignals.length" class="text-xs text-muted-foreground">이 Lot에서 확인된 이상 신호가 없습니다.</li>
          </ul>
          <div v-for="x in r.escape_candidates || []" :key="x.escape_code" class="mt-3 rounded-lg bg-muted/60 p-3 text-xs">
            <b class="text-[13px] font-semibold">유출 원인 · {{ x.escape_name }}</b>
            <p class="mt-1 leading-relaxed text-[#3b404a]">{{ x.summary }}</p>
          </div>
        </div>
      </section>

      <!-- 재발·개선: 재발 판정 · 개선안 -->
      <section v-show="tab === 'recur'" :class="card">
        <header class="flex items-center gap-2">
          <h3 class="text-[15px] font-bold">재발 판정 · 개선안</h3>
          <Badge v-if="rec" class="ml-auto" :tone="pick(RECURRENCE, rec.status).tone">{{ pick(RECURRENCE, rec.status).label }}</Badge>
        </header>
        <div>
          <p v-if="rec" class="mt-2 text-sm leading-relaxed text-[#3b404a]">{{ rec.reason }}</p>
          <p v-if="rec?.corrective_action" class="mt-1 text-xs text-muted-foreground">비교한 조치 {{ rec.corrective_action.corrective_action_id }} · {{ rec.corrective_action.description }} ({{ fmtDate(rec.corrective_action.implemented_at) }} 시행)</p>
          <div class="mt-3 grid gap-2">
            <div v-for="p in improvement.process || []" :key="p.cause_code" class="rounded-lg border p-3 text-xs">
              <b class="text-[13px] font-semibold">공정 개선</b> <span class="text-muted-foreground">· {{ p.owner_dept }}</span>
              <p class="mt-1 font-medium">{{ p.standard_action }}</p>
              <p class="mt-1 leading-relaxed text-[#3b404a]">{{ p.action }}</p>
            </div>
            <div v-for="p in improvement.inspection || []" :key="p.escape_code" class="rounded-lg border p-3 text-xs">
              <b class="text-[13px] font-semibold">검사 기준 개선</b>
              <p class="mt-1 font-medium">{{ p.standard_action }}</p>
              <p class="mt-1 leading-relaxed text-[#3b404a]">{{ p.action }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 영향 Lot -->
    <section v-show="tab === 'impact'" :class="card">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">영향 후보 Lot</h3>
        <span class="text-sm text-muted-foreground tabular">{{ lots.total }}개</span>
        <span class="ml-auto text-xs text-muted-foreground">같은 설비 ±{{ lots.window_hours || 24 }}시간 또는 같은 자재 Lot · QA 확인용</span>
      </header>
      <div>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-xs text-muted-foreground">
                <th class="py-2 pr-3 font-semibold">Lot</th><th class="py-2 pr-3 font-semibold">제품</th><th class="py-2 pr-3 font-semibold">대표 공통점</th>
                <th class="py-2 pr-3 text-right font-semibold">공통점</th><th class="py-2 pr-3 font-semibold">1순위 원인 설비</th>
                <th class="py-2 pr-3 text-right font-semibold">출하 수량</th><th class="py-2 text-right font-semibold">기존 반품</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in lotRows" :key="it.lot_id" class="border-b last:border-b-0">
                <td class="py-2 pr-3 font-semibold tabular">{{ it.lot_id }}</td>
                <td class="py-2 pr-3 text-muted-foreground">{{ it.spec_id }}</td>
                <td class="py-2 pr-3">{{ sharedText(it) }}</td>
                <td class="py-2 pr-3 text-right tabular">{{ it.shared_count }}</td>
                <td class="py-2 pr-3"><Badge v-if="it.matches_top_cause" tone="red">공유</Badge><span v-else class="text-xs text-muted-foreground">—</span></td>
                <td class="py-2 pr-3 text-right tabular">{{ it.shipped ? it.shipped_boards?.toLocaleString() : '미출하' }}</td>
                <td :class="it.known_returns ? 'font-bold text-[#d91d40]' : ''" class="py-2 text-right tabular">{{ it.known_returns }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="lots.items.length > 6" type="button" class="mt-2 text-xs font-semibold text-[#4269af] underline-offset-4 hover:underline" @click="showAllLots = !showAllLots">
          {{ showAllLots ? '접기' : `목록 ${lots.items.length}개 모두 보기` }}<template v-if="lots.total > lots.items.length"> (전체 {{ lots.total }}개 중 상위 {{ lots.items.length }}개)</template>
        </button>
      </div>
    </section>

    <!-- 유사 사례 -->
    <section v-show="tab === 'similar'" :class="card">
      <header class="flex items-center gap-2">
        <h3 class="text-[15px] font-bold">유사 사례 <span class="text-sm font-normal text-muted-foreground">같은 증상 · 분석 시점 이전 확정분</span></h3>
      </header>
      <ul class="mt-3 grid gap-2 md:grid-cols-2">
        <li v-for="s in r.similar_cases" :key="s.rma_id" class="rounded-lg border p-3 text-xs">
          <div class="flex items-center gap-2">
            <b class="text-[13px] font-semibold tabular">{{ s.rma_id }}</b>
            <Badge :tone="s.certainty === 'CONFIRMED' ? 'green' : 'blue'">{{ s.certainty === 'CONFIRMED' ? '확정 원인' : '추정 원인' }}</Badge>
            <span class="ml-auto font-semibold tabular">{{ s.similarity.toFixed(2) }}</span>
          </div>
          <p class="mt-1 text-[#3b404a]">{{ s.cause_code }}<template v-if="s.equipment_id"> · {{ s.equipment_id }}</template> · {{ fmtDate(s.opened_at) }}</p>
          <p class="mt-1 line-clamp-2 text-muted-foreground">{{ s.snippet }}</p>
        </li>
        <li v-if="!r.similar_cases?.length" class="text-xs text-muted-foreground">분석 시점 이전에 확정된 같은 증상 사례가 없습니다.</li>
      </ul>
    </section>
  </div>
</template>
