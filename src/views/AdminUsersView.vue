<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, RefreshCw, ShieldCheck, X } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import PageHead from '@/components/PageHead.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api, fmtDateTime } from '@/lib/api'
import { reportLoadError, toast } from '@/lib/state'

const TABS = [
  { key: 'PENDING', label: '승인 대기' },
  { key: 'ALL', label: '전체' },
  { key: 'APPROVED', label: '승인 완료' },
  { key: 'REJECTED', label: '반려' },
]

const STATUS_META = {
  PENDING: { label: '승인 대기', tone: 'yellow' },
  APPROVED: { label: '승인 완료', tone: 'green' },
  REJECTED: { label: '반려', tone: 'red' },
}

const tab = ref('PENDING')
const items = ref(null)
const busyId = ref(null)

const filtered = computed(() => {
  if (!items.value) return []
  if (tab.value === 'ALL') return items.value
  return items.value.filter((u) => u.approval_status === tab.value)
})

const pendingCount = computed(() => (items.value || []).filter((u) => u.approval_status === 'PENDING').length)

async function load() {
  items.value = null
  try {
    const res = await api('/admin/users')
    items.value = res?.items || []
  } catch (e) {
    reportLoadError(e)
    items.value = []
  }
}

async function decide(user, action) {
  busyId.value = user.id
  try {
    const updated = await api(`/admin/users/${user.id}/${action}`, { method: 'POST' })
    const idx = items.value.findIndex((u) => u.id === user.id)
    if (idx >= 0) items.value[idx] = updated
    toast({
      title: action === 'approve' ? `${user.name}(${user.username}) 가입을 승인했습니다` : `${user.name}(${user.username}) 가입을 반려했습니다`,
      tone: action === 'approve' ? 'green' : 'default',
    })
  } catch (e) {
    toast({ title: e.message || '처리에 실패했습니다', tone: 'red' })
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <PageHead :crumb="false" title="회원 가입 승인" description="신규 가입 신청을 검토하고 승인 또는 반려합니다. 승인된 계정만 로그인할 수 있습니다.">
    <template #actions>
      <Button variant="outline" size="sm" @click="load">
        <RefreshCw class="size-3.5" />새로고침
      </Button>
    </template>
  </PageHead>

  <Card :padded="false">
    <div class="flex flex-wrap items-center gap-1 border-b px-4 pt-2">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="relative flex items-center gap-1.5 px-3 pb-2.5 pt-2 text-sm font-semibold transition-colors"
        :class="tab === t.key ? 'text-primary shadow-[inset_0_-2px_0_var(--color-primary)]' : 'text-muted-foreground hover:text-foreground'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span
          v-if="t.key === 'PENDING' && pendingCount > 0"
          class="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular"
        >
          {{ pendingCount }}
        </span>
      </button>
    </div>

    <div class="overflow-x-auto px-5 py-4">
      <Skeleton v-if="!items" class="h-44" />
      <p v-else-if="!filtered.length" class="py-12 text-center text-sm text-muted-foreground">
        {{ tab === 'PENDING' ? '승인 대기 중인 회원이 없습니다.' : '표시할 회원이 없습니다.' }}
      </p>
      <table v-else class="w-full min-w-[680px] text-left text-sm">
        <thead class="text-xs text-muted-foreground">
          <tr class="[&_th]:py-2 [&_th]:font-medium">
            <th>이름</th>
            <th>아이디</th>
            <th>신청 역할</th>
            <th>상태</th>
            <th>신청 시각</th>
            <th class="text-right">처리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id" class="border-t [&_td]:py-3">
            <td class="font-semibold">
              <span class="inline-flex items-center gap-1.5">
                {{ u.name }}
                <Badge v-if="u.is_admin" tone="purple"><ShieldCheck class="mr-0.5 inline size-3" />관리자</Badge>
              </span>
            </td>
            <td class="font-mono text-xs text-muted-foreground">{{ u.username }}</td>
            <td><Badge tone="outline">{{ u.role_label }}</Badge></td>
            <td>
              <Badge :tone="(STATUS_META[u.approval_status] || STATUS_META.PENDING).tone">
                {{ (STATUS_META[u.approval_status] || STATUS_META.PENDING).label }}
              </Badge>
            </td>
            <td class="text-xs text-muted-foreground tabular">{{ u.created_at ? fmtDateTime(u.created_at) : '—' }}</td>
            <td class="text-right">
              <div v-if="!u.is_admin" class="inline-flex items-center gap-1.5">
                <Button
                  v-if="u.approval_status !== 'APPROVED'"
                  size="sm"
                  :disabled="busyId === u.id"
                  @click="decide(u, 'approve')"
                >
                  <Check class="size-3.5" />승인
                </Button>
                <Button
                  v-if="u.approval_status !== 'REJECTED'"
                  variant="outline"
                  size="sm"
                  :disabled="busyId === u.id"
                  @click="decide(u, 'reject')"
                >
                  <X class="size-3.5" />반려
                </Button>
              </div>
              <span v-else class="text-xs text-muted-foreground">관리자 계정</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Card>
</template>
