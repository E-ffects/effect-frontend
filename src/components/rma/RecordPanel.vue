<script setup>
import { computed, ref } from 'vue'
import { Pencil } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { api, fmtDateTime } from '@/lib/api'
import { toast } from '@/lib/state'

// ⑥ 처리 방법 · 결과 기록 (대응 이력 축적, FR-02-5)
const props = defineProps({ rma: Object, view: String }) // view: quality | cs
const emit = defineEmits(['saved'])

const STATUSES = ['접수', '분석중', '원인확정', '처리완료']
const method = ref('')
const result = ref('')
const nextStatus = ref('')
const actionResult = ref('효과있음')
const disposition = ref('')
const satisfaction = ref('')
const saving = ref(false)
const editing = ref(null)

const nextOptions = computed(() => STATUSES.slice(STATUSES.indexOf(props.rma.claim_status) + 1))
const records = computed(() => props.rma.timeline.filter((e) => e.kind === 'record').reverse())
const methodPh = computed(() => (props.view === 'cs' ? '응대 내용 (예: 교체품 출하, 수리 접수, 환불 처리)' : '처리 방법 (예: LOT 격리 후 펌웨어 재기록)'))

async function save() {
  if (!method.value.trim()) return
  saving.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/records`, {
      method: 'POST',
      body: {
        method: method.value, result: result.value, next_status: nextStatus.value || null,
        action_result: nextStatus.value === '처리완료' && props.view === 'quality' ? actionResult.value : null,
        disposition: nextStatus.value === '처리완료' && props.view === 'cs' ? disposition.value || null : null,
        satisfaction: nextStatus.value === '처리완료' && satisfaction.value ? Number(satisfaction.value) : null,
      },
    })
    toast({ title: '처리 기록을 저장했습니다', description: '처리 및 대응 현황에 추가되었습니다', tone: 'green' })
    method.value = result.value = nextStatus.value = ''
    emit('saved')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}

async function saveEdit() {
  if (!editing.value.method.trim()) return
  saving.value = true
  try {
    await api(`/rmas/${props.rma.rma_id}/records/${editing.value.id}`, { method: 'PUT', body: { method: editing.value.method, result: editing.value.result } })
    editing.value = null
    emit('saved')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <!-- B 처리완료: 기록 표시 + [수정] -->
    <div v-if="rma.completed" class="space-y-2">
      <p v-if="!records.length" class="text-sm text-muted-foreground">기록이 없습니다.</p>
      <div v-for="r in records" :key="r.id" class="rounded-md border p-3 text-sm">
        <template v-if="editing?.id === r.id">
          <textarea v-model="editing.method" rows="2" class="w-full rounded-md border px-2 py-1.5 text-sm" />
          <input v-model="editing.result" class="mt-1.5 h-8 w-full rounded-md border px-2 text-sm" placeholder="결과" />
          <div class="mt-2 flex justify-end gap-1.5">
            <Button variant="ghost" size="xs" @click="editing = null">취소</Button>
            <Button size="xs" :loading="saving" :disabled="!editing.method.trim()" @click="saveEdit">저장</Button>
          </div>
        </template>
        <template v-else>
          <div class="flex items-start justify-between gap-2">
            <p>{{ r.method }}</p>
            <Button variant="ghost" size="xs" @click="editing = { id: r.id, method: r.method, result: r.result || '' }"><Pencil class="size-3" />수정</Button>
          </div>
          <p v-if="r.result" class="text-xs text-muted-foreground">결과: {{ r.result }}</p>
          <p class="mt-1 text-[12px] text-muted-foreground">{{ r.actor }}, {{ fmtDateTime(r.updated_at || r.ts) }}</p>
        </template>
      </div>
    </div>
    <!-- A 진행 중: 입력 -->
    <form v-else class="space-y-2" @submit.prevent="save">
      <textarea v-model="method" rows="2" :placeholder="methodPh" class="w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      <input v-model="result" placeholder="결과 (선택)" class="h-8 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground" />
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="nextStatus" size="sm" placeholder="상태 유지" :options="nextOptions.map((s) => ({ value: s, label: `${s}` }))" />
        <template v-if="nextStatus === '처리완료'">
          <Select v-if="view === 'quality'" v-model="actionResult" size="sm" :options="['효과있음', '부분효과', '효과없음']" />
          <Select v-if="view === 'cs'" v-model="disposition" size="sm" placeholder="처분" :options="['교체', '수리', '환불', '무상보증']" />
          <Select v-if="view === 'cs'" v-model="satisfaction" size="sm" placeholder="고객 만족도" :options="[5, 4, 3, 2, 1].map((n) => ({ value: n, label: `만족도 ${n}` }))" />
        </template>
        <Button type="submit" size="sm" class="ml-auto" :disabled="!method.trim()" :loading="saving">저장</Button>
      </div>
      <p class="text-[12px] text-muted-foreground">저장 즉시 처리 및 대응 현황에 추가되며, 이후 유사 사례 검색과 챗봇 답변의 대응 이력으로 사용됩니다.</p>
    </form>
  </div>
</template>
