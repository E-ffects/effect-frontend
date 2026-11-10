<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from 'lucide-vue-next'
import AlertItem from './AlertItem.vue'
import Button from './ui/Button.vue'
import { api } from '@/lib/api'
import { removeAlert, starAlert, toast } from '@/lib/state'

const router = useRouter()
const open = ref(false)
const items = ref([])
const unread = ref(0)
const root = ref(null)
const TOAST_TYPES = ['고위험', '재발 의심', '확산형']
let lastMaxId = null
let timer

function shownIds() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('rma.toasted') || '[]'))
  } catch {
    return new Set()
  }
}

function remember(ids) {
  try {
    sessionStorage.setItem('rma.toasted', JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

async function load() {
  const data = await api('/alerts', { query: { limit: 5 } })
  items.value = data.items
  unread.value = data.unread
  // 신규 고위험·재발 의심·확산형 알림은 토스트 (세션당 1회)
  const shown = shownIds()
  const fresh = lastMaxId == null
    ? data.items.filter((a) => !a.read && Date.now() - new Date(a.created_at) < 86400000)
    : (await api('/alerts', { query: { after_id: lastMaxId } })).items
  for (const a of fresh.filter((a) => TOAST_TYPES.includes(a.type) && !shown.has(a.id)).reverse()) {
    shown.add(a.id)
    toast({
      title: `[${a.type}] ${a.target_label}`,
      description: a.reason,
      tone: a.type === '고위험' ? 'red' : 'purple',
      duration: 10000,
      action: { label: '지금 확인', onClick: () => markRead(a) },
    })
  }
  remember(shown)
  lastMaxId = data.max_id
}

async function markRead(a) {
  open.value = false
  try {
    await api(`/alerts/${a.id}/read`, { method: 'POST' })
  } catch {
    toast({ title: '대상을 찾을 수 없습니다', tone: 'red' })
    return
  }
  load()
  // RMA 대상 → 목록 행 펼침 / 패턴 대상(급증·반복 재발) → 알림·재발 관리
  if (TOAST_TYPES.includes(a.type)) router.push({ path: '/rmas', query: { open: a.rma_id } })
  else router.push({ path: '/quality/recurrence', query: { recurId: a.recur_id } })
}

async function readAll() {
  await api('/alerts/read-all', { method: 'POST' })
  load()
}

function outside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(() => {
  load()
  timer = setInterval(load, 30000) // 실시간 연결 대신 30초 주기 갱신
  addEventListener('mousedown', outside)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  removeEventListener('mousedown', outside)
})
</script>

<template>
  <div ref="root" class="relative">
    <Button variant="ghost" size="icon" aria-label="알림" @click="open = !open">
      <Bell class="size-4" />
      <span v-if="unread" class="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-sk-red px-1 text-[12px] font-bold leading-4 text-white tabular">
        {{ unread > 99 ? '99+' : unread }}
      </span>
    </Button>
    <div v-if="open" class="absolute right-0 z-40 mt-2 w-[400px] rounded-lg border bg-card shadow-lg">
      <div class="flex items-center justify-between border-b px-4 py-3">
        <p class="text-sm font-semibold">알림 <span class="text-muted-foreground font-normal">미확인 {{ unread }}건</span></p>
        <Button variant="link" size="xs" @click="readAll">모두 읽음</Button>
      </div>
      <p v-if="!items.length" class="px-4 py-8 text-center text-sm text-muted-foreground">새로운 알림이 없습니다</p>
      <ul v-else class="max-h-[420px] divide-y overflow-y-auto">
        <li v-for="a in items" :key="a.id">
          <AlertItem :alert="a" @open="markRead" @star="(x) => starAlert(api, x, load)" @remove="(x) => removeAlert(api, x, load)" />
        </li>
      </ul>
      <RouterLink to="/quality/recurrence" class="block border-t px-4 py-2.5 text-center text-xs font-medium hover:bg-muted/60" @click="open = false">
        알림 센터 전체 보기
      </RouterLink>
    </div>
  </div>
</template>
