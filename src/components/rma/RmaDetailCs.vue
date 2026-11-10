<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, FileText, Search } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import RmaReportDialog from '@/components/RmaReportDialog.vue'
import AiDisclaimer from '@/components/AiDisclaimer.vue'
import QtyProgress from './QtyProgress.vue'
import RecordPanel from './RecordPanel.vue'
import Section from './Section.vue'
import Timeline from './Timeline.vue'
import { useRmaDetail } from './useRmaDetail'
import { fmtDate } from '@/lib/api'
import { SEVERITY_TONE, STATUS_TONE } from '@/lib/badges'
import { toast } from '@/lib/state'

// SCR-RMA-003 고객대응관리자 펼침 영역 — 고객에게 무엇을, 언제까지 안내할지
const props = defineProps({ rmaId: String })
const emit = defineEmits(['changed'])
const router = useRouter()
const { rma, error, similar, similarState, assist, assistError, init, loadDetail, loadSimilar } = useRmaDetail(props.rmaId)
const reportOpen = ref(false)

onMounted(init)

async function onSaved() {
  const wasCompleted = rma.value.completed
  await loadDetail()
  if (!wasCompleted && rma.value.completed) similarState.value = 'idle'
  emit('changed')
}

async function copyDraft() {
  try {
    await navigator.clipboard.writeText(assist.value.draft)
    toast({ title: '안내 문구를 복사했습니다', tone: 'green' })
  } catch {
    toast({ title: '복사하지 못했습니다', tone: 'red' })
  }
}

const openRma = (id) => router.push({ path: '/rmas', query: { open: id } })
const satStars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—')
</script>

<template>
  <div class="bg-muted/40 p-4">
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <div v-else-if="!rma" class="grid grid-cols-3 gap-3"><Skeleton class="h-56" /><Skeleton class="h-56" /><Skeleton class="h-56" /></div>
    <template v-else>
      <div class="mb-3 flex items-center gap-2">
        <span class="text-base font-semibold">{{ rma.rma_id }}</span>
        <Badge :tone="SEVERITY_TONE[rma.severity]">{{ rma.severity }}</Badge>
        <Badge :tone="STATUS_TONE[rma.claim_status]">{{ rma.claim_status }}</Badge>
        <span class="text-xs text-muted-foreground">{{ rma.completed ? 'B 처리완료' : 'A 진행 중' }}</span>
        <Button variant="outline" size="sm" class="ml-auto" @click="reportOpen = true">
          <FileText class="size-3.5" />AI 보고서 보기
          <Badge v-if="rma.report.exists" :tone="rma.report.reviewed ? 'green' : 'yellow'">{{ rma.report.reviewed ? '검토 완료' : '검토 전' }}</Badge>
        </Button>
      </div>

      <div class="grid grid-cols-12 gap-3">
        <Section no="1" title="반품 기본 정보 (고객 응대용)" class="col-span-4">
          <dl class="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt class="text-muted-foreground">고객사</dt><dd class="font-medium">{{ rma.customer_name }} <span class="text-xs font-normal text-muted-foreground">({{ rma.customer_type }})</span></dd>
            <dt class="text-muted-foreground">제품</dt><dd>{{ rma.product }} {{ rma.product_name }} <span class="text-xs text-muted-foreground">{{ rma.product_grade }}<template v-if="rma.product_capacity && !rma.product_name.includes(rma.product_capacity)">, {{ rma.product_capacity }}</template></span></dd>
            <dt class="text-muted-foreground">고객 증상</dt><dd>{{ rma.symptom }}</dd>
            <template v-if="rma.subtype_source"><dt class="text-muted-foreground">불량 유형</dt><dd>{{ rma.defect_type }}<template v-if="rma.defect_subtype">&nbsp;<span class="text-[#c4c8cf]">/</span> {{ rma.defect_subtype }}</template></dd></template>
            <template v-if="rma.subtype_candidates?.length"><dt class="text-muted-foreground">소분류 후보</dt><dd>{{ rma.subtype_candidates.join(', ') }}</dd></template>
            <dt class="text-muted-foreground">수량</dt><dd><QtyProgress :claim="rma.claim_qty" :inspected="rma.inspected_qty" :defect="rma.defect_qty" /></dd>
            <template v-if="rma.serial_numbers?.length"><dt class="text-muted-foreground">시리얼</dt><dd class="font-mono text-[13px]" :title="rma.serial_numbers.join(', ')">{{ rma.serial_numbers.slice(0, 3).join(', ') }}<span v-if="rma.serial_numbers.length > 3" class="font-sans text-xs text-muted-foreground"> 외 {{ rma.serial_numbers.length - 3 }}개</span></dd></template>
            <dt class="text-muted-foreground">심각도</dt><dd><Badge :tone="SEVERITY_TONE[rma.severity]">{{ rma.severity }}</Badge></dd>
            <template v-if="!rma.completed">
              <dt class="text-muted-foreground">접수 / 경과</dt><dd class="tabular">{{ fmtDate(rma.claim_date) }}, <span :class="rma.elapsed_days > 7 ? 'font-medium text-orange-600' : ''">{{ rma.elapsed_days }}일 경과</span></dd>
            </template>
            <template v-else>
              <dt class="text-muted-foreground">처리 기간</dt><dd class="tabular">{{ fmtDate(rma.claim_date) }} ~ {{ fmtDate(rma.completed_date) }} ({{ rma.resolve_days }}일)</dd>
            </template>
            <dt class="text-muted-foreground">보증 상태</dt>
            <dd><Badge v-if="rma.warranty_expired" tone="red">보증 만료</Badge><span v-else-if="rma.warranty_until">보증 중 <span class="text-xs text-muted-foreground">(~{{ fmtDate(rma.warranty_until) }})</span></span><span v-else class="text-muted-foreground">기록 없음</span></dd>
            <dt class="text-muted-foreground">고객 요청</dt><dd :class="{ 'text-muted-foreground': !rma.customer_request }">{{ rma.customer_request || '기록 없음' }}</dd>
            <dt class="text-muted-foreground">처리 상태</dt>
            <dd><Badge :tone="STATUS_TONE[rma.claim_status]">{{ rma.claim_status }}</Badge> <span v-if="rma.reply_due" class="text-xs text-muted-foreground">회신 예정 {{ fmtDate(rma.reply_due) }}</span></dd>
            <dt class="text-muted-foreground">응대 담당</dt><dd>{{ rma.handler_name }}</dd>
          </dl>
        </Section>

        <Section no="2" title="처리 및 대응 현황" class="col-span-4">
          <div class="max-h-[330px] overflow-y-auto pr-1"><Timeline :events="rma.timeline" :completed="rma.completed" :status="rma.claim_status" /></div>
        </Section>

        <div class="col-span-4 space-y-3">
          <Section no="3" :title="rma.completed ? '응대 결과' : '권장 응대'">
            <template v-if="rma.completed">
              <dl class="grid grid-cols-[88px_1fr] gap-y-2 text-sm">
                <dt class="text-muted-foreground">실제 처분</dt><dd class="font-medium">{{ rma.disposition }}</dd>
                <dt class="text-muted-foreground">실제 소요</dt>
                <dd class="tabular">{{ rma.resolve_days }}일 <span v-if="assist?.expected_days" class="text-xs text-muted-foreground">(권장 {{ assist.expected_days }}일 대비 {{ rma.resolve_days - assist.expected_days >= 0 ? '+' : '' }}{{ rma.resolve_days - assist.expected_days }}일)</span></dd>
                <dt class="text-muted-foreground">고객 만족도</dt><dd class="tracking-widest">{{ satStars(rma.customer_satisfaction) }}</dd>
                <dt class="text-muted-foreground">안내 완료일</dt><dd class="tabular">{{ fmtDate(rma.completed_date) }}</dd>
              </dl>
            </template>
            <template v-else>
              <p v-if="assistError" class="text-sm text-amber-700">{{ assistError }} — 권장 응대와 안내 초안을 만들 수 없습니다.</p>
              <Skeleton v-else-if="!assist" class="h-32" />
              <p v-else-if="!assist.available" class="text-sm text-muted-foreground">{{ assist.message }}</p>
              <div v-else class="space-y-2 text-sm">
                <p>권장 처분 <b>{{ assist.disposition }}</b> <span class="text-xs text-muted-foreground">({{ assist.basis }})</span></p>
                <p>예상 소요일 <b class="tabular">약 {{ assist.expected_days }}일</b></p>
                <div class="rounded-md border bg-muted/40 p-2.5 text-xs leading-relaxed">
                  <div class="mb-1 flex items-center justify-between"><span class="font-medium">고객 안내 문구 초안</span><Button variant="ghost" size="xs" @click="copyDraft"><Copy class="size-3" />복사</Button></div>
                  {{ assist.draft }}
                </div>
                <AiDisclaimer text="AI 초안입니다. 최종 처분과 안내는 담당자가 결정합니다." />
              </div>
            </template>
          </Section>
          <Section no="4" title="응대 내용 및 결과 기록">
            <RecordPanel :rma="rma" view="cs" @saved="onSaved" />
          </Section>
        </div>

        <Section no="5" title="과거 유사 사례 비교 (고객 응대 관점)" note="접수일 이전, 유사도 0.7 이상" class="col-span-12">
          <template v-if="rma.completed && similarState === 'idle'" #actions>
            <Button size="sm" variant="outline" @click="loadSimilar"><Search class="size-3.5" />유사 사례 검색</Button>
          </template>
          <p v-if="rma.completed && similarState === 'idle'" class="text-sm text-muted-foreground">처리완료 건은 유사 사례를 기본으로 표시하지 않습니다. [유사 사례 검색]을 누르면 검색합니다.</p>
          <div v-else-if="similarState === 'loading'" class="grid grid-cols-5 gap-3"><Skeleton v-for="i in 5" :key="i" class="h-40" /></div>
          <p v-else-if="similarState === 'error'" class="text-sm text-amber-700">유사 사례를 불러오지 못했습니다.</p>
          <p v-else-if="!similar?.items.length" class="text-sm text-muted-foreground">참고할 과거 사례가 없습니다</p>
          <template v-else>
            <div class="mb-3 flex flex-wrap gap-4 rounded-md bg-muted/60 px-3 py-2 text-xs">
              <span><b class="font-medium">유사 {{ similar.items.length }}건 요약</b></span>
              <span>처분 분포: <template v-for="(n, d) in similar.summary.disposition_dist" :key="d">{{ d }} {{ n }} </template></span>
              <span>효과있음 사례 평균 해결 <b class="tabular">{{ similar.summary.effective_avg_days ?? '—' }}일</b></span>
              <span>평균 만족도 <b class="tabular">{{ similar.summary.avg_satisfaction ?? '—' }}</b> / 5</span>
            </div>
            <div class="grid grid-cols-5 gap-3">
              <div v-for="s in similar.items" :key="s.rma_id" class="rounded-md border p-3 text-xs">
                <div class="flex items-center justify-between">
                  <button class="font-semibold underline underline-offset-2" @click="openRma(s.rma_id)">{{ s.rma_id }}</button>
                  <span class="tabular font-semibold">{{ s.similarity.toFixed(2) }}</span>
                </div>
                <dl class="mt-2 space-y-1">
                  <div><dt class="inline text-muted-foreground">고객 증상 </dt><dd class="inline">{{ s.symptom }}</dd></div>
                  <div><dt class="inline text-muted-foreground">처분 </dt><dd class="inline font-medium">{{ s.disposition }}</dd></div>
                  <div><dt class="inline text-muted-foreground">해결 소요 </dt><dd class="inline tabular">{{ s.days_to_resolve }}일</dd></div>
                  <div><dt class="inline text-muted-foreground">고객 만족도 </dt><dd class="inline tracking-wider">{{ satStars(s.satisfaction) }}</dd></div>
                  <div class="flex items-center gap-1"><dt class="text-muted-foreground">재접수</dt><dd><Badge :tone="s.reclaimed ? 'red' : 'gray'">{{ s.reclaimed ? '있음' : '없음' }}</Badge></dd></div>
                </dl>
              </div>
            </div>
          </template>
        </Section>
      </div>
      <RmaReportDialog v-model:open="reportOpen" :rma-id="rma.rma_id" @changed="loadDetail" />
    </template>
  </div>
</template>
