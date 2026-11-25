<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Pencil, Plus, PlayCircle } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api, fmtDate } from '@/lib/api'
import { reportLoadError, toast } from '@/lib/state'
import { RECURRENCE, pick } from '@/lib/caseLabels'

// 대책 관리 (품질관리자): 대책 계획 등록·수정, 시행일 기록, 선택한 대책의 재발 검토 이력
// POST /recurrence/investigations/{id}/actions · PUT·GET /recurrence/actions/{id} · POST .../implement · GET /recurrence/reviews
const props = defineProps({ action: Object, actions: Array, roleMap: Object, categoryMap: Object })
const emit = defineEmits(['changed'])

const id = computed(() => props.action?.corrective_action_id)
const editable = computed(() => !!props.action && !props.action.implemented_at) // 시행 전에만 계획을 바꾼다
const label = (map, v) => map?.[v] || v || '—'
const toOptions = (map) => Object.entries(map || {}).map(([value, l]) => ({ value, label: l }))
const investigations = computed(() => {
  const m = new Map()
  for (const a of props.actions || []) m.set(a.investigation_id, a.investigation_title)
  return [...m]
})
const toIso = (date) => `${date}T00:00:00+09:00`

// ---------- 재발 검토 이력 ----------
const reviews = ref(null)
watch([id, () => props.action?.implemented_at], async ([v]) => {
  reviews.value = null
  if (!v) return
  const res = await api('/recurrence/reviews', { query: { corrective_action_id: v, size: 50 } }).catch((e) => (reportLoadError(e), { items: [] }))
  reviews.value = res.items
}, { immediate: true })

// ---------- 대책 등록·수정 ----------
const EMPTY = { investigation_id: '', action_role: '', action_category: '', description: '', owner_dept: '', due: '', cause_code: '', escape_code: '' }
const form = reactive({ ...EMPTY })
const formOpen = ref(false)
const mode = ref('create')
const scope = ref(null) // 수정 때 기존 적용 범위를 그대로 돌려보낸다
const saving = ref(false)
const formOk = computed(() => (mode.value === 'edit' || form.investigation_id.trim()) && form.action_role && form.action_category && form.description.trim() && form.owner_dept.trim() && form.due)

function openCreate() {
  Object.assign(form, EMPTY, { investigation_id: props.action?.investigation_id || '' })
  mode.value = 'create'
  scope.value = null
  formOpen.value = true
}
async function openEdit() {
  try {
    const d = await api(`/recurrence/actions/${id.value}`)
    Object.assign(form, EMPTY, {
      investigation_id: d.investigation_id, action_role: d.action_role, action_category: d.action_category, description: d.description,
      owner_dept: d.owner_dept, due: (d.due_at || '').slice(0, 10), cause_code: d.cause_code || '', escape_code: d.escape_code || '',
    })
    scope.value = d.scope ?? null
    mode.value = 'edit'
    formOpen.value = true
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  }
}
async function save() {
  saving.value = true
  try {
    const body = {
      action_role: form.action_role, action_category: form.action_category, description: form.description.trim(), owner_dept: form.owner_dept.trim(),
      cause_code: form.cause_code.trim() || null, escape_code: form.escape_code.trim() || null, due_at: toIso(form.due), scope: scope.value,
    }
    const res = mode.value === 'create'
      ? await api(`/recurrence/investigations/${encodeURIComponent(form.investigation_id.trim())}/actions`, { method: 'POST', body })
      : await api(`/recurrence/actions/${id.value}`, { method: 'PUT', body })
    toast({ title: mode.value === 'create' ? '대책 계획을 등록했습니다' : '대책 계획을 수정했습니다', tone: 'green' })
    formOpen.value = false
    emit('changed', res?.corrective_action_id)
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}

// ---------- 시행일 기록 ----------
const implOpen = ref(false)
const implDate = ref('')
const implementing = ref(false)
function openImplement() {
  implDate.value = '' // 날짜를 직접 고르게 한다 (잘못된 날짜가 조용히 기록되지 않도록)
  implOpen.value = true
}
async function implement() {
  implementing.value = true
  try {
    await api(`/recurrence/actions/${id.value}/implement`, { method: 'POST', body: { implemented_at: toIso(implDate.value) } })
    toast({ title: '시행일을 기록했습니다. 효과 검증 대기로 바뀝니다', tone: 'green' })
    implOpen.value = false
    emit('changed', id.value)
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    implementing.value = false
  }
}

const field = 'h-9 w-full rounded-md border bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
</script>

<template>
  <section class="rounded-[14px] border bg-card shadow-card p-5">
    <header class="flex flex-wrap items-center gap-2">
      <h3 class="text-[15px] font-bold">대책 관리</h3>
      <span class="text-xs text-muted-foreground">대책 계획을 등록하고, 시행일을 기록하면 효과 검증이 시작됩니다</span>
      <div class="ml-auto flex gap-2">
        <Button size="sm" variant="outline" :disabled="!editable" title="시행 전 대책만 바꿀 수 있습니다" @click="openEdit"><Pencil class="size-3.5" />계획 수정</Button>
        <Button size="sm" variant="outline" :disabled="!editable" @click="openImplement"><PlayCircle class="size-3.5" />시행 기록</Button>
        <Button size="sm" @click="openCreate"><Plus class="size-3.5" />대책 등록</Button>
      </div>
    </header>

    <template v-if="action">
      <p class="mt-3 text-sm">
        <b>{{ action.corrective_action_id }}</b>
        <span class="text-muted-foreground"> · {{ label(roleMap, action.action_role) }} · {{ label(categoryMap, action.action_category) }} · 담당 {{ action.owner_dept }} · 기한 {{ fmtDate(action.due_at) }} · 시행일 {{ fmtDate(action.implemented_at) }}</span>
      </p>
      <p class="mt-0.5 text-xs text-[#3b404a]">{{ action.description }}</p>

      <h4 class="mt-4 text-xs font-semibold text-muted-foreground">재발 검토 이력</h4>
      <Skeleton v-if="!reviews" class="mt-2 h-16" />
      <p v-else-if="!reviews.length" class="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">이 대책으로 검토된 재발 건이 없습니다.</p>
      <table v-else class="mt-1 w-full text-xs">
        <thead class="text-muted-foreground">
          <tr><th class="py-1.5 text-left font-medium">RMA</th><th class="text-left font-medium">조치 후 생산</th><th class="text-left font-medium">증상 일치</th><th class="text-left font-medium">원인 일치</th><th class="text-left font-medium">판정</th><th class="text-right font-medium">검토일</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in reviews" :key="r.review_id" class="border-t">
            <td class="py-2"><RouterLink :to="{ path: '/rmas', query: { open: r.rma_id } }" class="font-medium hover:text-primary">{{ r.rma_id }}</RouterLink></td>
            <td>{{ r.lot_produced_after_action ? '예' : '아니오' }}</td>
            <td>{{ r.symptom_match ? '일치' : '불일치' }}</td>
            <td>{{ r.cause_match ? '일치' : '불일치' }}</td>
            <td><Badge :tone="pick(RECURRENCE, r.verdict).tone">{{ pick(RECURRENCE, r.verdict).label }}</Badge></td>
            <td class="text-right tabular">{{ fmtDate(r.reviewed_at) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-else class="mt-3 text-sm text-muted-foreground">위 대책 이력에서 대책을 고르면 계획과 재발 검토 이력이 보입니다.</p>
  </section>

  <Dialog v-model:open="formOpen" :title="mode === 'create' ? '대책 계획 등록' : '대책 계획 수정'" :description="mode === 'create' ? '조사 하나에 대책을 추가합니다. 시행 전까지 수정할 수 있습니다.' : `${id} · 시행 전 계획만 바꿀 수 있습니다`">
    <div class="grid gap-3 text-sm">
      <label v-if="mode === 'create'" class="grid gap-1">
        <span class="text-xs font-medium text-muted-foreground">조사 ID</span>
        <Input v-model="form.investigation_id" list="recurrence-investigations" placeholder="예: INV-0001" />
        <datalist id="recurrence-investigations"><option v-for="[v, t] in investigations" :key="v" :value="v">{{ t }}</option></datalist>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">구분</span><Select v-model="form.action_role" :options="toOptions(roleMap)" placeholder="구분 선택" class="w-full" /></label>
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">조치 유형</span><Select v-model="form.action_category" :options="toOptions(categoryMap)" placeholder="유형 선택" class="w-full" /></label>
      </div>
      <label class="grid gap-1">
        <span class="text-xs font-medium text-muted-foreground">대책 내용</span>
        <textarea v-model="form.description" rows="3" maxlength="4000" :class="field" class="h-auto py-2 leading-relaxed" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">담당 부서</span><Input v-model="form.owner_dept" maxlength="100" /></label>
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">시행 기한</span><input v-model="form.due" type="date" :class="field" /></label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">원인 코드 (선택)</span><Input v-model="form.cause_code" maxlength="100" /></label>
        <label class="grid gap-1"><span class="text-xs font-medium text-muted-foreground">유출 코드 (선택)</span><Input v-model="form.escape_code" maxlength="100" /></label>
      </div>
    </div>
    <template #footer>
      <Button variant="outline" @click="formOpen = false">취소</Button>
      <Button :loading="saving" :disabled="!formOk" @click="save">{{ mode === 'create' ? '등록' : '저장' }}</Button>
    </template>
  </Dialog>

  <Dialog v-model:open="implOpen" title="대책 시행일 기록" :description="`${id} · 기록하면 계획을 바꿀 수 없고 효과 검증 대기로 바뀝니다`" width="max-w-sm">
    <label class="grid gap-1 text-sm"><span class="text-xs font-medium text-muted-foreground">시행일</span><input v-model="implDate" type="date" :class="field" /></label>
    <template #footer>
      <Button variant="outline" @click="implOpen = false">취소</Button>
      <Button :loading="implementing" :disabled="!implDate" @click="implement">시행 기록</Button>
    </template>
  </Dialog>
</template>
