<script setup>
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { fmtDate, fmtDateTime, fmtWon } from '@/lib/api'
import { renderPcbSnapshots } from '@/lib/pcbSnapshot'

const props = defineProps({
  // 원본 보고서: { header, report, departments }
  detail: { type: Object, default: null },
  // 부서 전달본: PatternDeliveryResponse (전달본 모드일 때만 전달)
  delivery: { type: Object, default: null },
})
const emit = defineEmits(['open-rma'])

const isDelivery = computed(() => !!props.delivery)
const header = computed(() => (isDelivery.value ? props.delivery.header : props.detail?.header) || {})
const body = computed(() => (isDelivery.value ? props.delivery : props.detail?.report) || {})

const totals = computed(() => body.value.totals || {})
const narrative = computed(() => body.value.narrative || {})
const monthly = computed(() => body.value.monthly || [])
const products = computed(() => body.value.products || [])
const lots = computed(() => body.value.lots || [])
const equipment = computed(() => body.value.equipment || [])
const assessments = computed(() => body.value.assessments || [])
const findings = computed(() => body.value.findings || [])
const processFlow = computed(() => body.value.process_flow || [])
const materials = computed(() => body.value.materials || [])
const actions = computed(() => body.value.actions || [])
const evidenceCases = computed(() => body.value.evidence_cases || [])

const maxMonthly = computed(() => Math.max(1, ...monthly.value.map((m) => m.claims || 0)))
const primaryPartNo = computed(() => header.value.product || products.value[0]?.part_no || null)

const cad = ref(null)
watch(
  primaryPartNo,
  async (p) => {
    cad.value = null
    if (!p) return
    const snap = await renderPcbSnapshots(p)
    if (primaryPartNo.value === p) cad.value = snap
  },
  { immediate: true },
)

const KIND_LABEL = { OCCURRENCE: '발생 원인', DETECTION_ESCAPE: '검출 유출' }
const SELECTION_LABEL = { CONFIRMED_TEST: '확정 원인 · 반송품 검사 근거', LINKED_CASE: '조사 연결 사례' }

function scrollToSection(id) {
  const target = document.getElementById(id)
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="pdf-root bg-card text-[#1f242d]">
    <!-- 상단 그라데이션 바 & 헤더 -->
    <div class="h-1" style="background: linear-gradient(90deg, #ea002c 0%, #f47725 100%)" />
    <header
      id="pattern-summary-top"
      class="pdf-keep border-b border-[#f3dfe3] px-7 pb-5 pt-6"
      style="background: linear-gradient(160deg, #fff1f3 0%, #fff7f1 48%, #ffffff 100%)"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[12px] font-extrabold text-primary">
          {{ isDelivery ? `E!FFECT / ${delivery.department?.name || '부서'} 전달본` : 'E!FFECT / DEFECT PATTERN REPORT' }}
        </p>
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge v-if="isDelivery && delivery.department?.recommended" class="pdf-badge" tone="green">추천 대상 부서</Badge>
          <Badge v-if="!isDelivery && body.analysis_level" class="pdf-badge" tone="red">{{ body.analysis_level }}</Badge>
          <Badge v-if="!isDelivery && body.investigation_status" class="pdf-badge" tone="outline">{{ body.investigation_status }}</Badge>
        </div>
      </div>

      <h2 class="mt-2 text-[24px] font-extrabold leading-[1.3]">
        {{ header.title || `${header.pattern_id} 불량 패턴 보고서` }}
      </h2>
      <p class="mt-1.5 text-xs font-medium text-[#5f6673]">
        패턴 번호 <b class="text-[#1f242d]">{{ header.pattern_id }}</b>
        · 보고서 #{{ header.report_id }}
        · 집계 범위 {{ fmtDate(header.from) }} ~ {{ fmtDate(header.to) }}
        · 대상 제품 {{ header.product || '전체 제품' }}
        · 생성 {{ fmtDateTime(header.generated_at) }}
      </p>

      <!-- 문서 내 빠른 이동 (PDF에서는 제외) -->
      <div v-if="!isDelivery && evidenceCases.length" data-pdf-ignore class="mt-3.5 flex flex-wrap items-center gap-1.5">
        <button
          class="rounded-full border border-[#e2d5d8] bg-white px-2.5 py-1 text-xs font-semibold text-[#3a404b] hover:border-primary hover:text-primary"
          @click="scrollToSection('pattern-summary-top')"
        >
          패턴 종합
        </button>
        <button
          v-for="ec in evidenceCases"
          :key="ec.rma_id"
          class="rounded-full border border-[#f2c8d0] bg-[#fff6f7] px-2.5 py-1 text-xs font-semibold text-primary hover:bg-[#ffe8ec]"
          @click="scrollToSection(`appendix-${ec.rma_id}`)"
        >
          부록 · {{ ec.rma_id }}
        </button>
      </div>

      <!-- 핵심 집계 요약 (A4 폭에서도 넉넉하도록 3x2 / 넓은 화면 6열) -->
      <dl class="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#f1dfe2] bg-[#f1dfe2] text-[12px] lg:grid-cols-6">
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">클레임 건수</dt><dd class="mt-0.5 text-[15px] font-bold">{{ totals.claims ?? 0 }}건</dd></div>
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">영향 Lot</dt><dd class="mt-0.5 text-[15px] font-bold">{{ totals.lots ?? 0 }}개</dd></div>
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">청구 수량</dt><dd class="mt-0.5 text-[15px] font-bold">{{ (totals.claimed_quantity ?? 0).toLocaleString() }}</dd></div>
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">확인 수량</dt><dd class="mt-0.5 text-[15px] font-bold">{{ totals.verified_quantity != null ? totals.verified_quantity.toLocaleString() : '미기록' }}</dd></div>
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">미해결</dt><dd class="mt-0.5 text-[15px] font-bold" :class="(totals.unresolved_claims || 0) > 0 ? 'text-sk-orange' : ''">{{ totals.unresolved_claims ?? 0 }}건</dd></div>
        <div class="bg-white/90 px-3 py-2.5"><dt class="text-muted-foreground">기간 조사 손실*</dt><dd class="mt-0.5 text-[15px] font-bold">{{ fmtWon(totals.investigation_loss_krw) }}</dd></div>
      </dl>
      <p class="mt-1.5 text-[11px] text-muted-foreground">* 손실 금액은 제품 필터와 별개로 선택 기간 내 조사 전체 원장 합계 기준입니다.</p>
    </header>

    <div class="pdf-body space-y-5 px-7 pb-8 pt-6 text-sm leading-relaxed">
      <!-- 전달본 전용: QA 요청 사항 & 회신 기한 -->
      <section v-if="isDelivery" class="pdf-keep rounded-xl border border-[#f5c8d0] bg-[#fff8f9] p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-[14px] font-bold text-primary">QA 요청 사항 ({{ delivery.department?.name }})</h3>
          <span v-if="delivery.reply_due_date" class="pdf-badge rounded-md border border-[#f3c6ce] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#b3001f]">
            회신 기한: {{ fmtDate(delivery.reply_due_date) }}
          </span>
        </div>
        <p class="mt-2 whitespace-pre-line text-[13px] text-[#2d3440]">{{ delivery.request_note || '요청 사항 없음' }}</p>
      </section>

      <!-- 01. 종합 결론 & 추이 -->
      <section v-if="narrative.conclusion || narrative.trend" class="pdf-keep">
        <h3 class="mb-2 flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">01</span>종합 결론 및 발생 추이</h3>
        <div class="space-y-1.5 rounded-xl border bg-[#fafbfc] p-3.5 text-[13px]">
          <p v-if="narrative.conclusion" class="font-semibold text-[#1f242d]">{{ narrative.conclusion }}</p>
          <p v-if="narrative.trend" class="text-[#4b5566]">{{ narrative.trend }}</p>
        </div>
      </section>

      <!-- 02. 월별 발생 추이 & 제품별 현황 -->
      <section v-if="monthly.length || products.length" class="pdf-keep">
        <h3 class="mb-2 flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">02</span>발생 추이 및 제품별 현황</h3>
        <div class="grid gap-3 md:grid-cols-2">
          <div v-if="monthly.length" class="rounded-xl border p-3.5">
            <p class="mb-2.5 text-xs font-semibold text-muted-foreground">월별 클레임 건수</p>
            <div class="space-y-2">
              <div v-for="m in monthly" :key="m.month" class="flex items-center gap-2 text-xs">
                <span class="w-16 shrink-0 text-muted-foreground">{{ m.month }}</span>
                <div class="h-3.5 flex-1 overflow-hidden rounded bg-[#eef1f5]">
                  <div class="h-full rounded bg-primary/85" :style="{ width: `${Math.max(4, ((m.claims || 0) / maxMonthly) * 100)}%` }" />
                </div>
                <span class="w-12 shrink-0 text-right font-semibold">{{ m.claims }}건</span>
              </div>
            </div>
          </div>

          <div v-if="products.length" class="overflow-hidden rounded-xl border">
            <table class="w-full text-xs">
              <thead class="bg-[#f6f7f9] text-muted-foreground">
                <tr><th class="px-3 py-2 text-left font-semibold">제품 품번</th><th class="px-3 py-2 text-right font-semibold">클레임</th><th class="px-3 py-2 text-right font-semibold">영향 Lot</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in products" :key="p.part_no" class="border-t">
                  <td class="px-3 py-2 font-semibold">{{ p.part_no }}</td>
                  <td class="px-3 py-2 text-right">{{ p.claims }}건</td>
                  <td class="px-3 py-2 text-right">{{ p.lots }}개</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 03. 참고 3D CAD 모델 (원본 기준 정적 2장면, 모델 없으면 생략) -->
      <section v-if="cad" class="pdf-keep">
        <h3 class="mb-2 flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">03</span>참고 3D PCB 스택업 ({{ cad.partNo }})</h3>
        <div class="grid grid-cols-2 gap-3">
          <figure class="overflow-hidden rounded-xl border bg-[#f4f6f9]">
            <img :src="cad.full" :alt="`${cad.partNo} 전체 3D 뷰`" class="pdf-cad-img block h-44 w-full object-contain" />
            <figcaption class="border-t bg-white px-3 py-1.5 text-[11px] text-muted-foreground">전체 3D 뷰 (표면 금회로 · 패드)</figcaption>
          </figure>
          <figure class="overflow-hidden rounded-xl border bg-[#f4f6f9]">
            <img :src="cad.cut" :alt="`${cad.partNo} 단면 스택업 뷰`" class="pdf-cad-img block h-44 w-full object-contain" />
            <figcaption class="border-t bg-white px-3 py-1.5 text-[11px] text-muted-foreground">단면 스택업 확대 (관통 비아 · 층 구조)</figcaption>
          </figure>
        </div>
        <p class="mt-1.5 text-[11px] text-muted-foreground">※ 제품 사양 기반의 가정 치수 모델이며, 실제 설계 도면이나 보드 위 결함 좌표를 뜻하지 않습니다.</p>
      </section>

      <!-- 04. 원인 판정 · 근거 · 공정 흐름 -->
      <section v-if="assessments.length || findings.length || processFlow.length" class="pdf-page-before space-y-3">
        <div class="pdf-keep space-y-2.5">
          <h3 class="flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">04</span>원인 판정 및 공정 흐름</h3>

          <div v-if="processFlow.length" class="rounded-xl border p-3.5">
            <p class="mb-2 text-xs font-semibold text-muted-foreground">공정 흐름 (확정 판정 단계 표시)</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="s in processFlow"
                :key="s.process_id"
                class="pdf-badge rounded-md border px-2 py-1 text-[11px] font-medium"
                :class="s.defect_occurrence ? 'border-[#ea002c] bg-[#fff1f3] font-bold text-[#b3001f]' : s.detection_escape ? 'border-[#e8a33d] bg-[#fff8ec] font-bold text-[#9a6411]' : 'border-[#e3e5e9] bg-[#f8f9fb] text-[#5f6673]'"
              >
                {{ s.name }}<b v-if="s.defect_occurrence" class="ml-1 text-[#ea002c]">[발생]</b><b v-if="s.detection_escape" class="ml-1 text-[#b45309]">[유출]</b>
              </span>
            </div>
          </div>
        </div>

        <div v-if="assessments.length" class="pdf-keep overflow-hidden rounded-xl border">
          <table class="w-full text-xs">
            <thead class="bg-[#f6f7f9] text-muted-foreground">
              <tr><th class="px-3 py-2 text-left font-semibold">구분</th><th class="px-3 py-2 text-left font-semibold">판정 내용</th><th class="px-3 py-2 text-left font-semibold">상태</th><th class="px-3 py-2 text-left font-semibold">공정 / 설비</th></tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in assessments" :key="i" class="border-t">
                <td class="px-3 py-2 font-semibold">{{ KIND_LABEL[a.kind] || a.kind }}</td>
                <td class="px-3 py-2">{{ a.name }} <span v-if="a.code" class="text-muted-foreground">({{ a.code }})</span></td>
                <td class="px-3 py-2"><Badge class="pdf-badge" tone="outline">{{ a.status }}</Badge></td>
                <td class="px-3 py-2">{{ [a.process_id, a.equipment_id].filter(Boolean).join(' · ') || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="findings.length" class="space-y-1.5 text-xs">
          <li v-for="(f, i) in findings" :key="i" class="pdf-keep rounded-lg border bg-[#fafbfc] px-3 py-2">
            <span class="mr-2 font-bold text-primary">{{ f.source_type || f.kind }}</span>
            <span>{{ f.summary }}</span>
          </li>
        </ul>
      </section>

      <!-- 05. 영향 Lot · 설비 · 자재 이력 (새 페이지에서 깔끔하게 시작) -->
      <section v-if="lots.length || equipment.length || materials.length" class="pdf-page-before space-y-3">
        <div class="pdf-keep space-y-2.5">
          <h3 class="flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">05</span>연결 Lot · 설비 · 자재 이력</h3>
          <div v-if="lots.length" class="rounded-xl border p-3.5">
            <p class="mb-2 text-xs font-semibold text-muted-foreground">연결 생산 Lot ({{ lots.length }}개 · 연결 횟수 기준, 원인 확정과 별개)</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="l in lots" :key="l.lot" class="pdf-badge rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{{ l.lot }} <span class="font-normal text-muted-foreground">{{ l.count }}건</span></span>
            </div>
          </div>
        </div>

        <div v-if="equipment.length" class="pdf-keep rounded-xl border p-3.5">
          <p class="mb-2 text-xs font-semibold text-muted-foreground">연결 설비 ({{ equipment.length }}대 · 연결 횟수 기준, 원인 확정과 별개)</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="e in equipment" :key="e.equipment_id" class="pdf-badge rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{{ e.equipment_id }} <span class="font-normal text-muted-foreground">{{ e.count }}건</span></span>
          </div>
        </div>

        <div v-if="materials.length" class="overflow-hidden rounded-xl border">
          <table class="w-full text-[11.5px]">
            <thead class="bg-[#f6f7f9] text-muted-foreground">
              <tr><th class="px-3 py-1.5 text-left font-semibold">자재 Lot</th><th class="px-3 py-1.5 text-left font-semibold">자재 유형</th><th class="px-3 py-1.5 text-left font-semibold">공급사</th><th class="px-3 py-1.5 text-left font-semibold">입고 검사</th><th class="px-3 py-1.5 text-right font-semibold">연결 Lot</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in materials" :key="m.material_lot_id" class="border-t">
                <td class="px-3 py-1.5 font-semibold">{{ m.material_lot_id }}</td>
                <td class="px-3 py-1.5">{{ m.material_type }}</td>
                <td class="px-3 py-1.5">{{ m.supplier }}</td>
                <td class="px-3 py-1.5">{{ m.inspection_result || '—' }}</td>
                <td class="px-3 py-1.5 text-right">{{ m.affected_lots }}개</td>
              </tr>
            </tbody>
          </table>
          <p class="border-t bg-[#fafbfc] px-3 py-1.5 text-[11px] text-muted-foreground">※ 연결된 생산 Lot의 자재 이력이며, 자재 원인 확정 값을 뜻하지 않습니다.</p>
        </div>
      </section>

      <!-- 06. 개선 대책 및 효과 검증 -->
      <section v-if="actions.length" class="space-y-2.5">
        <div class="pdf-keep space-y-2.5">
          <h3 class="flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">06</span>개선 대책 및 효과 검증</h3>
          <div v-if="actions[0]" class="rounded-xl border p-3.5 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-bold text-[#1f242d]">{{ actions[0].department }} · {{ actions[0].action_id }}</span>
              <span class="flex items-center gap-2 text-muted-foreground">
                <span v-if="actions[0].due_at">목표 {{ fmtDate(actions[0].due_at) }}</span>
                <span v-if="actions[0].implemented_at">적용 {{ fmtDate(actions[0].implemented_at) }}</span>
                <Badge class="pdf-badge" tone="outline">{{ actions[0].verification_status || '진행 중' }}</Badge>
              </span>
            </div>
            <p class="mt-1.5 text-[13px] text-[#2d3440]">{{ actions[0].description }}</p>
            <table v-if="actions[0].checks?.length" class="mt-2 w-full border-t text-[11.5px]">
              <thead class="text-muted-foreground">
                <tr><th class="py-1.5 text-left font-semibold">검증 지표</th><th class="py-1.5 text-right font-semibold">기준</th><th class="py-1.5 text-right font-semibold">목표</th><th class="py-1.5 text-right font-semibold">측정</th><th class="py-1.5 text-right font-semibold">결과</th></tr>
              </thead>
              <tbody>
                <tr v-for="(ck, idx) in actions[0].checks" :key="idx" class="border-t">
                  <td class="py-1.5 font-medium">{{ ck.metric }}</td>
                  <td class="py-1.5 text-right">{{ ck.baseline ?? '—' }}</td>
                  <td class="py-1.5 text-right">{{ ck.target ?? '—' }}</td>
                  <td class="py-1.5 text-right font-semibold">{{ ck.measured ?? '—' }}</td>
                  <td class="py-1.5 text-right font-semibold">{{ ck.result || '관찰 중' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-for="act in actions.slice(1)" :key="act.action_id" class="pdf-keep rounded-xl border p-3.5 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-bold text-[#1f242d]">{{ act.department }} · {{ act.action_id }}</span>
            <span class="flex items-center gap-2 text-muted-foreground">
              <span v-if="act.due_at">목표 {{ fmtDate(act.due_at) }}</span>
              <span v-if="act.implemented_at">적용 {{ fmtDate(act.implemented_at) }}</span>
              <Badge class="pdf-badge" tone="outline">{{ act.verification_status || '진행 중' }}</Badge>
            </span>
          </div>
          <p class="mt-1.5 text-[13px] text-[#2d3440]">{{ act.description }}</p>
          <table v-if="act.checks?.length" class="mt-2 w-full border-t text-[11.5px]">
            <thead class="text-muted-foreground">
              <tr><th class="py-1.5 text-left font-semibold">검증 지표</th><th class="py-1.5 text-right font-semibold">기준</th><th class="py-1.5 text-right font-semibold">목표</th><th class="py-1.5 text-right font-semibold">측정</th><th class="py-1.5 text-right font-semibold">결과</th></tr>
            </thead>
            <tbody>
              <tr v-for="(ck, idx) in act.checks" :key="idx" class="border-t">
                <td class="py-1.5 font-medium">{{ ck.metric }}</td>
                <td class="py-1.5 text-right">{{ ck.baseline ?? '—' }}</td>
                <td class="py-1.5 text-right">{{ ck.target ?? '—' }}</td>
                <td class="py-1.5 text-right font-semibold">{{ ck.measured ?? '—' }}</td>
                <td class="py-1.5 text-right font-semibold">{{ ck.result || '관찰 중' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 부록: 근거 RMA 상세 (새 페이지에서 깔끔하게 시작 + 각 부록 카드가 절대 중간에서 찢어지지 않음) -->
      <section v-if="evidenceCases.length" class="pdf-page-before space-y-4 border-t pt-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="flex items-center gap-2 text-[14.5px] font-bold"><span class="text-xs font-extrabold text-primary">부록</span>근거 RMA 상세 ({{ evidenceCases.length }}건)</h3>
          <div data-pdf-ignore class="flex flex-wrap gap-1.5">
            <button
              v-for="ec in evidenceCases"
              :key="`jump-${ec.rma_id}`"
              class="rounded-md border px-2 py-0.5 text-xs font-semibold hover:border-primary hover:text-primary"
              @click="scrollToSection(`appendix-${ec.rma_id}`)"
            >
              {{ ec.rma_id }}
            </button>
          </div>
        </div>

        <article
          v-for="(ec, idx) in evidenceCases"
          :id="`appendix-${ec.rma_id}`"
          :key="ec.rma_id"
          class="pdf-keep scroll-mt-24 rounded-xl border bg-[#fcfcfd] p-3.5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <span class="mr-2 text-xs font-extrabold text-primary">부록 {{ idx + 1 }}</span>
              <b class="text-[14.5px] font-bold">{{ ec.rma_id }}</b>
              <span class="ml-2 text-xs text-muted-foreground">{{ ec.part_no }} · 접수 {{ fmtDate(ec.opened_on) }} · {{ ec.detection_stage || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Badge class="pdf-badge" tone="outline">{{ SELECTION_LABEL[ec.selection_reason] || ec.selection_reason || ec.qa_status }}</Badge>
              <button
                data-pdf-ignore
                class="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                @click="emit('open-rma', ec.rma_id)"
              >
                RMA 상세 열기
              </button>
            </div>
          </div>
          <p v-if="ec.membership_reason" class="mt-1.5 text-xs text-muted-foreground">연결 사유: {{ ec.membership_reason }}</p>

          <div v-for="(item, iIdx) in ec.items || []" :key="iIdx" class="mt-2.5 space-y-2 rounded-lg border bg-white p-3 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span><b>Lot {{ item.lot_id || '—' }}</b> · {{ item.symptom || '증상 미기록' }}</span>
              <span class="text-muted-foreground">
                청구 {{ item.claimed_quantity }} / 반송 {{ item.returned_quantity }} / 확인 {{ item.verified_quantity != null ? item.verified_quantity : '—' }}
              </span>
            </div>

            <table v-if="item.measurements?.length" class="w-full border-t text-[11.5px]">
              <thead class="text-muted-foreground">
                <tr><th class="py-1 text-left font-semibold">반송품 검사 항목</th><th class="py-1 text-right font-semibold">측정값</th><th class="py-1 text-right font-semibold">판정</th></tr>
              </thead>
              <tbody>
                <tr v-for="(ms, mIdx) in item.measurements" :key="mIdx" class="border-t">
                  <td class="py-1">{{ ms.name }}</td>
                  <td class="py-1 text-right">{{ ms.value }} {{ ms.unit || '' }}</td>
                  <td class="py-1 text-right font-semibold">{{ ms.result || '—' }}</td>
                </tr>
              </tbody>
            </table>

            <table v-if="item.observations?.length" class="w-full border-t text-[11.5px]">
              <thead class="text-muted-foreground">
                <tr><th class="py-1 text-left font-semibold">공정 / 설비</th><th class="py-1 text-left font-semibold">항목</th><th class="py-1 text-right font-semibold">관측값 (규격)</th><th class="py-1 text-right font-semibold">SPC</th></tr>
              </thead>
              <tbody>
                <tr v-for="(ob, oIdx) in item.observations" :key="oIdx" class="border-t">
                  <td class="py-1">{{ ob.process_id }} · {{ ob.equipment_id }}</td>
                  <td class="py-1">{{ ob.item_code }}</td>
                  <td class="py-1 text-right">{{ ob.value }} {{ ob.unit || '' }} ({{ ob.lower_limit ?? '—' }}~{{ ob.upper_limit ?? '—' }})</td>
                  <td class="py-1 text-right font-semibold" :class="ob.spc_flag && ob.spc_flag !== 'NORMAL' ? 'text-primary' : ''">{{ ob.spc_flag || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>
