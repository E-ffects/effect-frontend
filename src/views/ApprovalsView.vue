<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import { api, fmtDateTime } from '@/lib/api'
import { reportLoadError } from '@/lib/state'
import { LEVEL_TONE } from '@/lib/caseLabels'

// 품질관리자가 손대야 할 건 모음 (Spring_API_v6)
// - L3 판정 대기 / 승인 / 반려: GET /api/approvals?status=
// - L1·L2 확인 대기 / 확인 완료: GET /api/approvals?status=&level=L1_L2
// - 임시 판정 확인: GET /api/triage-reviews (QA 판정안이 임시라 사람이 확인해야 원인분석이 시작되는 건)
const router = useRouter()
const TABS = [
  { k: 'L3', l: 'L3 판정 대기', query: { status: 'WAITING' }, empty: '판정을 기다리는 L3 건이 없습니다.' },
  { k: 'L12', l: 'L1·L2 확인 대기', query: { status: 'WAITING', level: 'L1_L2' }, empty: '확인을 기다리는 L1·L2 건이 없습니다.' },
  { k: 'TRIAGE', l: '임시 판정 확인', triage: true, empty: '확인할 임시 QA 판정이 없습니다.' },
  { k: 'APPROVED', l: '승인', query: { status: 'APPROVED' } },
  { k: 'REJECTED', l: '반려', query: { status: 'REJECTED' } },
  { k: 'CONFIRMED', l: '확인 완료', query: { status: 'CONFIRMED', level: 'L1_L2' } },
]
const tab = ref('L3')
const cur = computed(() => TABS.find((t) => t.k === tab.value))
const data = ref(null)

async function load() {
  data.value = null
  try {
    data.value = cur.value.triage
      ? await api('/triage-reviews', { query: { page: 1, size: 30 } })
      : await api('/approvals', { query: { ...cur.value.query, page: 1, size: 30 } })
  } catch (e) {
    reportLoadError(e)
    data.value = { items: [], total: 0 }
  }
}
onMounted(load)
function pickTab(k) {
  tab.value = k
  load()
}
</script>

<template>
  <PageHead title="원인 판정" :crumb="false" description="L3는 원인 후보를 채택하고 승인해야, L1·L2는 확인해야 확정 원인이 됩니다. 임시 QA 판정은 확인해야 원인분석이 시작됩니다." />

  <div class="seg mb-4 w-fit flex-wrap" role="tablist">
    <button
      v-for="t in TABS" :key="t.k" role="tab" :aria-selected="tab === t.k"
      class="seg-item px-3.5 py-1.5 text-[13px] font-semibold"
      @click="pickTab(t.k)"
    >{{ t.l }}</button>
  </div>

  <div class="rounded-[14px] border bg-card">
    <div v-if="!data" class="grid gap-2 p-5"><Skeleton v-for="i in 3" :key="i" class="h-14" /></div>
    <p v-else-if="!data.items.length" class="p-10 text-center text-sm text-muted-foreground">{{ cur.empty || '해당하는 건이 없습니다.' }}</p>

    <!-- 임시 판정 확인: AI 판정안과 그 이유를 보여 주고, 케이스 화면에서 확인·수정한다 -->
    <ul v-else-if="cur.triage">
      <li v-for="it in data.items" :key="it.rma_id" class="border-b last:border-b-0">
        <button type="button" class="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50" @click="router.push(`/rmas/${it.rma_id}/case`)">
          <div class="w-[112px] shrink-0">
            <p class="font-semibold tabular">{{ it.rma_id }}</p>
            <p class="text-xs text-muted-foreground tabular">{{ fmtDateTime(it.opened_at) }}</p>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ it.customer_name }} · {{ it.reported_part_no }}<template v-if="it.minor_name"> · {{ it.minor_name }}</template></p>
            <p class="mt-0.5 truncate text-sm text-muted-foreground">AI 판정안: {{ it.proposal?.rationale || '—' }}</p>
          </div>
          <span v-if="it.proposal?.severity" class="hidden text-xs text-muted-foreground tabular md:inline">심각도 {{ it.proposal.severity }}</span>
          <Badge v-if="it.proposal?.analysis_level" :tone="LEVEL_TONE[it.proposal.analysis_level]">임시 {{ it.proposal.analysis_level }}</Badge>
          <ChevronRight class="size-4 text-muted-foreground" />
        </button>
      </li>
    </ul>

    <ul v-else>
      <li v-for="it in data.items" :key="it.rma_id" class="border-b last:border-b-0">
        <button type="button" class="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50" @click="router.push(`/rmas/${it.rma_id}/case`)">
          <div class="w-[112px] shrink-0">
            <p class="font-semibold tabular">{{ it.rma_id }}</p>
            <p class="text-xs text-muted-foreground tabular">{{ fmtDateTime(it.requested_at) }}</p>
          </div>
          <div class="min-w-0 flex-1">
            <!-- Spring_API_v6 승인 목록에는 고객사·제품이 없다. 오면 보여 준다 -->
            <p v-if="it.customer_name || it.reported_part_no" class="truncate text-sm">{{ [it.customer_name, it.reported_part_no, it.minor_name].filter(Boolean).join(' · ') }}</p>
            <p class="mt-0.5 text-sm">1순위 <b class="font-semibold">{{ it.top_cause_name || '—' }}</b></p>
          </div>
          <div class="hidden flex-wrap justify-end gap-1 md:flex">
            <Badge v-for="a in it.approval_reasons" :key="a" tone="outline">{{ a }}</Badge>
          </div>
          <Badge :tone="LEVEL_TONE[it.analysis_level] || 'gray'">{{ it.analysis_level }}</Badge>
          <ChevronRight class="size-4 text-muted-foreground" />
        </button>
      </li>
    </ul>
  </div>
</template>
