<script setup>
import PageHead from '@/components/PageHead.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AlertItem from '@/components/AlertItem.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BeforeAfterChart from '@/components/charts/BeforeAfterChart.vue'
import ActionManage from '@/components/recurrence/ActionManage.vue'
import { MailOpen, Star, Trash2 } from 'lucide-vue-next'
import { api, fmtDate } from '@/lib/api'
import { persistedRef } from '@/lib/persist'
import { removeAlert, reportLoadError, starAlert, toast } from '@/lib/state'

// SCR-RCR-001 알림 · 재발 관리
const route = useRoute()
const router = useRouter()
const TABS = ['전체', '즐겨찾기', '고위험', '재발 의심', '확산형', '급증', '반복 재발']
const tab = computed(() => route.query.tab || '전체')
const alerts = ref(null)
const actions = ref(null) // Spring GET /recurrence/actions 의 content.items (조사별 대책)
const trend = ref(null)
// 기본 선택: 시행 후 재발이 있는 대책 → 시행된 대책 → 첫 대책
const selected = computed(
  () =>
    route.query.recurId ||
    (actions.value?.find((a) => a.implemented_at && a.recurrence_count) || actions.value?.find((a) => a.implemented_at) || actions.value?.[0])
      ?.corrective_action_id ||
    null,
)
const selectedAction = computed(() => actions.value?.find((a) => a.corrective_action_id === selected.value))

// Spring 코드값 → 화면 문구
const ROLE = { OCCURRENCE: '발생 대책', ESCAPE: '유출 대책', PREVENTION: '예방 대책', HORIZONTAL: '수평 전개' }
const CATEGORY = { INSPECTION: '검사 강화', PROCESS_EQUIPMENT: '설비 개선', PROCESS_LOCAL: '공정 조건', SYSTEM: '시스템·기준', SUPPLIER_SCAR: '공급사 시정' }
const STATUS = { IMPLEMENTING: '시행 중', MONITORING: '효과 확인 중', EFFECTIVE: '효과있음', NOT_EFFECTIVE: '효과없음' }
const STATUS_TONE = { IMPLEMENTING: 'gray', MONITORING: 'blue', EFFECTIVE: 'green', NOT_EFFECTIVE: 'red' }
const label = (map, v) => map[v] || v || '—'

async function loadAlerts() {
  const t = tab.value
  alerts.value = await api('/alerts', { query: { type: ['전체', '즐겨찾기'].includes(t) ? '' : t, starred: t === '즐겨찾기' ? 'true' : '', limit: 100 } }).catch(reportLoadError)
}

watch(tab, loadAlerts, { immediate: true })
async function loadActions() {
  const res = await api('/recurrence/actions', { query: { size: 100 } }).catch(reportLoadError)
  actions.value = res?.items ?? []
}
async function loadTrend(id) {
  trend.value = null
  if (id) trend.value = await api(`/recurrence/actions/${id}/trend`).catch(reportLoadError)
}
onMounted(loadActions)
watch(selected, loadTrend, { immediate: true })

// 대책 등록·수정·시행 기록 뒤: 목록을 다시 불러오고, 새로 만든 대책을 고른다 (같은 대책이면 추이만 갱신)
async function onActionChanged(newId) {
  await loadActions()
  if (newId && newId !== selected.value) router.replace({ query: { ...route.query, recurId: newId } })
  else loadTrend(selected.value)
}

// ---------- 알림 일괄 선택 (Gmail 방식): 체크 → 읽음 처리 · 삭제 ----------
const picked = ref(new Set())
const pickedCount = computed(() => picked.value.size)
const allPicked = computed(() => !!alerts.value?.items.length && alerts.value.items.every((a) => picked.value.has(a.id)))
function togglePick(a) {
  const next = new Set(picked.value)
  next.has(a.id) ? next.delete(a.id) : next.add(a.id)
  picked.value = next
}
function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(alerts.value.items.map((a) => a.id))
}
// 목록이 바뀌면(탭 이동·삭제) 더 이상 없는 알림은 선택에서 뺀다
watch(alerts, (v) => {
  const ids = new Set((v?.items || []).map((a) => a.id))
  picked.value = new Set([...picked.value].filter((id) => ids.has(id)))
})
watch(tab, () => (picked.value = new Set()))
const bulkBusy = ref(false)
async function bulk(kind) {
  const ids = [...picked.value]
  if (!ids.length) return
  bulkBusy.value = true
  try {
    const res = await api(`/alerts/bulk-${kind}`, { method: 'POST', body: { ids } })
    toast({ title: kind === 'delete' ? `알림 ${res.deleted}건을 삭제했습니다` : `알림 ${res.updated}건을 읽음 처리했습니다`, tone: 'green' })
    picked.value = new Set()
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    bulkBusy.value = false
    loadAlerts()
  }
}

async function readAll() {
  await api('/alerts/read-all', { method: 'POST' })
  loadAlerts()
}

async function openAlert(a) {
  await api(`/alerts/${a.id}/read`, { method: 'POST' })
  if (['고위험', '재발 의심', '확산형'].includes(a.type)) {
    router.push({ path: '/rmas', query: { open: a.rma_id } })
    return
  }
  // 대책 대상 알림 → 대책 전후 추이 갱신
  const cm = a.recur_id && actions.value?.find((c) => c.corrective_action_id === a.recur_id)
  if (cm) router.replace({ query: { ...route.query, recurId: cm.corrective_action_id } })
  loadAlerts()
}

const fmtNum = (v) => (v == null ? '—' : Number.isInteger(v) ? v : v.toFixed(2))

// 대책 이력 필터 (드롭다운 값은 불러온 이력에서 만든다)
const EMPTY_FILTER = { role: '', category: '', dept: '', status: '', recurrence: '' }
const f = persistedRef('recurrence.actions.v2', { ...EMPTY_FILTER }) // 새로고침·이동 후에도 유지
const opts = (key, map) => [...new Set((actions.value || []).map((c) => c[key]).filter(Boolean))].sort().map((v) => ({ value: v, label: map ? label(map, v) : v }))
const filtered = computed(() =>
  (actions.value || []).filter((c) =>
    (!f.value.role || c.action_role === f.value.role) &&
    (!f.value.category || c.action_category === f.value.category) &&
    (!f.value.dept || c.owner_dept === f.value.dept) &&
    (!f.value.status || c.verification_status === f.value.status) &&
    (!f.value.recurrence || (f.value.recurrence === 'yes') === c.recurrence_count > 0),
  ),
)
const filterOn = computed(() => Object.values(f.value).some(Boolean))
const resetFilter = () => (f.value = { ...EMPTY_FILTER })
</script>

<template>
  <PageHead :crumb="false" title="알림 및 재발 관리" description="대책 이후의 변화를 추적하고, 반복되는 문제를 놓치지 마세요." />

  <div class="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
    <Card title="알림 센터" :padded="false" class="row-span-2">
      <!-- 카드 높이는 오른쪽 열(추이 + 대책 이력)에 맞추고, 목록은 남는 높이를 채운 뒤 안에서 스크롤 -->
      <div class="flex h-full flex-col">
      <!-- 탭: 한 줄 밑줄형 (v4). 건수 배지는 글자 위에 겹쳐 띄워 폭을 차지하지 않는다 — 건수가 생겨도 탭이 밀리지 않음 -->
      <nav class="mt-2 flex justify-between border-b px-2" aria-label="알림 종류">
        <button
          v-for="t in TABS"
          :key="t"
          :class="tab === t ? 'text-primary shadow-[inset_0_-2px_0_var(--color-primary)]' : 'text-[#5f6673] hover:text-foreground'"
          class="relative shrink-0 whitespace-nowrap px-2 pb-2.5 pt-3.5 text-[13px] font-semibold"
          :aria-current="tab === t ? 'page' : undefined"
          @click="router.replace({ query: { ...route.query, tab: t } })"
        >
          {{ t }}
          <span
            v-if="alerts && (t === '즐겨찾기' ? alerts.starred_count : t === '전체' ? alerts.unread : alerts.unread_by_type[t])"
            :class="t === '즐겨찾기' ? 'bg-sk-orange text-white' : 'bg-primary text-white'"
            class="absolute -right-0.5 top-0 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 tabular"
            :aria-label="t === '즐겨찾기' ? '즐겨찾기 개수' : '미확인 개수'"
          >
            {{ t === '즐겨찾기' ? alerts.starred_count : t === '전체' ? alerts.unread : alerts.unread_by_type[t] }}
          </span>
        </button>
      </nav>
      <!-- 일괄 선택 도구줄 -->
      <div v-if="alerts?.items.length" class="flex h-10 items-center gap-1 border-b px-3 text-xs">
        <label class="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted" :title="allPicked ? '전체 해제' : '전체 선택'">
          <input
            type="checkbox" class="size-4 cursor-pointer accent-[var(--color-primary)]" aria-label="전체 선택"
            :checked="allPicked" :indeterminate.prop="pickedCount > 0 && !allPicked" @change="toggleAll"
          />
          <span class="font-medium text-muted-foreground">{{ pickedCount ? `${pickedCount}개 선택됨` : '전체 선택' }}</span>
        </label>
        <template v-if="pickedCount">
          <span class="mx-1 h-4 w-px bg-border" />
          <button class="flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-[#4a5160] hover:bg-muted disabled:opacity-40" :disabled="bulkBusy" @click="bulk('read')"><MailOpen class="size-3.5" />읽음 처리</button>
          <button class="flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-sk-red hover:bg-brand-soft disabled:opacity-40" :disabled="bulkBusy" @click="bulk('delete')"><Trash2 class="size-3.5" />삭제</button>
          <button class="ml-auto rounded-md px-2 py-1 text-muted-foreground hover:bg-muted" @click="picked = new Set()">선택 해제</button>
        </template>
      </div>
      <div class="relative min-h-[440px] flex-1">
        <Skeleton v-if="!alerts" class="m-4 h-64" />
        <div v-else-if="!alerts.items.length" class="absolute inset-0 grid place-items-center px-8 text-center">
          <p class="text-sm text-muted-foreground">
            <Star v-if="tab === '즐겨찾기'" class="mx-auto mb-2 size-6 text-[#c4c8cf]" />
            {{ tab === '즐겨찾기' ? '즐겨찾기한 알림이 없습니다. 알림의 ☆를 눌러 추가하세요' : '새로운 알림이 없습니다' }}
          </p>
        </div>
        <ul v-else class="absolute inset-0 divide-y overflow-y-auto">
          <li v-for="a in alerts.items" :key="a.id">
            <AlertItem :alert="a" selectable :checked="picked.has(a.id)" @toggle="togglePick" @open="openAlert" @star="(x) => starAlert(api, x, loadAlerts)" @remove="(x) => removeAlert(api, x, loadAlerts)" />
          </li>
        </ul>
      </div>
      <div v-if="alerts" class="flex items-center justify-between border-t bg-muted/40 px-4 py-2.5 text-xs">
        <span class="text-muted-foreground">{{ tab }} <b class="font-bold text-foreground tabular">{{ alerts.items.length }}</b>건, 미확인 <b class="font-bold text-primary tabular">{{ alerts.unread }}</b>건</span>
        <button class="font-semibold text-muted-foreground hover:text-primary disabled:opacity-40" :disabled="!alerts.unread" @click="readAll">모두 읽음 처리</button>
      </div>
      </div>
    </Card>

    <Card :title="selectedAction ? `대책 전후 발생 추이: ${selectedAction.corrective_action_id} ${selectedAction.investigation_title}` : '대책 전후 발생 추이'"
      :description="selectedAction ? `${label(ROLE, selectedAction.action_role)} · ${label(CATEGORY, selectedAction.action_category)} — ${selectedAction.description}` : ''">
      <Skeleton v-if="!trend" class="h-72" />
      <template v-else>
        <p v-if="!trend.completed_dt" class="mb-2 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">대책 시행 후 비교됩니다 (아직 시행 전)</p>
        <BeforeAfterChart :points="trend.points" :completed="fmtDate(trend.completed_dt)" :before-avg="trend.before_avg" :after-avg="trend.after_avg" />
        <div class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">주간 평균 접수 전 → 후</p><p class="mt-1 font-semibold tabular">{{ fmtNum(trend.before_avg) }} → {{ fmtNum(trend.after_avg) }}건</p></div>
          <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">최근 3주 추세</p><p class="mt-1 font-semibold" :class="{ 'text-red-600': trend.recent_trend === '증가', 'text-emerald-600': trend.recent_trend === '감소' }">{{ trend.recent_trend || '—' }}</p></div>
          <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">효과 판정</p><p class="mt-1"><Badge v-if="selectedAction" :tone="STATUS_TONE[selectedAction.verification_status]">{{ label(STATUS, selectedAction.verification_status) }}</Badge></p></div>
          <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">확정 재발</p><p class="mt-1 font-semibold tabular" :class="{ 'text-red-600': selectedAction?.recurrence_count }">{{ selectedAction?.recurrence_count ?? 0 }}건</p></div>
        </div>
        <!-- 효과 검증 지표: 기준 → 목표 / 조치 후 -->
        <table v-if="trend.checks?.length" class="mt-4 w-full text-xs">
          <thead class="text-muted-foreground">
            <tr><th class="py-1.5 text-left font-medium">효과 검증 지표</th><th class="text-right font-medium">기준</th><th class="text-right font-medium">목표</th><th class="text-right font-medium">조치 후</th><th class="pl-3 text-left font-medium">결과</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in trend.checks" :key="c.check_id" class="border-t">
              <td class="py-2 pr-3">{{ c.metric }}<span class="block text-[11px] text-muted-foreground">{{ fmtDate(c.window_from) }} ~ {{ fmtDate(c.window_to) }}</span></td>
              <td class="text-right tabular">{{ fmtNum(c.baseline_value) }}</td>
              <td class="text-right tabular">{{ fmtNum(c.target_value) }}</td>
              <td class="text-right font-semibold tabular">{{ fmtNum(c.post_value) }}</td>
              <td class="pl-3"><Badge :tone="STATUS_TONE[c.result] || 'gray'">{{ label(STATUS, c.result) }}</Badge></td>
            </tr>
          </tbody>
        </table>
      </template>
    </Card>

    <Card title="대책 이력" :description="actions ? `행을 누르면 위 추이가 갱신됩니다 (${filtered.length} / ${actions.length}건)` : ''" :padded="false">
      <div class="flex flex-wrap items-center gap-2 px-5 pt-3">
        <Select v-model="f.role" size="sm" placeholder="전체 구분" :options="opts('action_role', ROLE)" />
        <Select v-model="f.category" size="sm" placeholder="전체 조치 유형" :options="opts('action_category', CATEGORY)" />
        <Select v-model="f.dept" size="sm" placeholder="전체 담당" :options="opts('owner_dept')" />
        <Select v-model="f.status" size="sm" placeholder="전체 상태" :options="opts('verification_status', STATUS)" />
        <Select v-model="f.recurrence" size="sm" placeholder="재발 전체" :options="[{ value: 'yes', label: '재발 있음' }, { value: 'no', label: '재발 없음' }]" />
        <button v-if="filterOn" class="text-xs font-semibold text-muted-foreground hover:text-primary" @click="resetFilter">필터 초기화</button>
      </div>
      <div class="max-h-[520px] overflow-y-auto px-5 pb-4 pt-2">
        <Skeleton v-if="!actions" class="h-40" />
        <p v-else-if="!filtered.length" class="py-10 text-center text-sm text-muted-foreground">조건에 맞는 대책이 없습니다</p>
        <!-- 짧은 칸은 한 줄로 두고, 조사명만 말줄임 -->
        <table v-else class="w-full text-sm [&_td]:whitespace-nowrap [&_td]:pr-3 [&_th]:whitespace-nowrap [&_th]:pr-3">
          <thead class="text-xs text-muted-foreground">
            <tr><th class="py-2 text-left font-medium">ID</th><th class="text-left font-medium">조사</th><th class="text-left font-medium">구분</th><th class="text-left font-medium">조치 유형</th><th class="text-left font-medium">담당</th><th class="text-left font-medium">상태</th><th class="text-left font-medium">시행일</th><th class="text-right font-medium">재발</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in filtered" :key="c.corrective_action_id" :class="selected === c.corrective_action_id ? 'bg-muted' : 'hover:bg-muted/50'" class="cursor-pointer border-t" @click="router.replace({ query: { ...route.query, recurId: c.corrective_action_id } })">
              <td class="py-2.5 font-medium">{{ c.corrective_action_id }}</td>
              <td class="max-w-[220px] py-2.5"><span class="block truncate" :title="c.investigation_title">{{ c.investigation_title }}</span><span class="text-[11px] text-muted-foreground">{{ c.investigation_id }}</span></td>
              <td class="py-2.5">{{ label(ROLE, c.action_role) }}</td>
              <td class="py-2.5" :title="c.description">{{ label(CATEGORY, c.action_category) }}</td>
              <td class="py-2.5 text-muted-foreground">{{ c.owner_dept }}</td>
              <td class="py-2.5"><Badge :tone="STATUS_TONE[c.verification_status]">{{ label(STATUS, c.verification_status) }}</Badge></td>
              <td class="py-2.5 tabular">{{ fmtDate(c.implemented_at) }}</td>
              <td class="py-2.5 text-right"><Badge v-if="c.recurrence_count" tone="purple">재발 {{ c.recurrence_count }}건</Badge><span v-else class="text-muted-foreground">없음</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>

  <ActionManage v-if="actions" class="mt-4" :action="selectedAction" :actions="actions" :role-map="ROLE" :category-map="CATEGORY" @changed="onActionChanged" />

  <Card title="판정 및 알림 기준" class="mt-4">
    <div class="grid grid-cols-1 gap-6 text-xs text-muted-foreground md:grid-cols-2">
      <ul class="list-disc space-y-1 pl-4">
        <li><b class="text-foreground">재발 의심</b>: 대책 완료 이후(발생일 기준) 같은 제품, 같은 불량 유형 RMA 발생 → 벨 + 토스트</li>
        <li><b class="text-foreground">확산형 재발 의심</b>: 대책 이후 다른 제품이지만 같은 설비, 같은 유형 발생 → 벨 + 토스트</li>
        <li><b class="text-foreground">고위험</b>: 심각도 CRITICAL RMA 접수 → 벨 + 토스트</li>
      </ul>
      <ul class="list-disc space-y-1 pl-4">
        <li><b class="text-foreground">급증</b>: 같은 제품, 유형 30일 내 3건 이상 증가 → 벨</li>
        <li><b class="text-foreground">반복 재발</b>: 같은 패턴 재발 2회 이상 → 벨</li>
        <li>재발여부의 최종 확정은 품질관리자가 RMA 상세에서 합니다.</li>
      </ul>
    </div>
  </Card>
</template>
