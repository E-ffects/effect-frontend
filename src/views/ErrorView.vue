<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FileQuestion, ServerCrash, ShieldAlert } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { auth, homePath } from '@/lib/state'

const route = useRoute()
const router = useRouter()
const code = computed(() => String(route.query.code || '404'))
const info = computed(
  () =>
    ({
      403: { icon: ShieldAlert, title: '접근 권한 없음', msg: '이 메뉴에 접근할 권한이 없습니다' },
      404: { icon: FileQuestion, title: '페이지 없음', msg: '요청하신 페이지를 찾을 수 없습니다' },
      500: { icon: ServerCrash, title: '서버 오류', msg: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요' },
    })[code.value] || { icon: ServerCrash, title: '오류', msg: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요' },
)
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <span class="flex size-14 items-center justify-center rounded-full bg-muted"><component :is="info.icon" class="size-6" /></span>
    <p class="text-sm font-medium text-muted-foreground">{{ code }} {{ info.title }}</p>
    <h1 class="text-xl font-semibold">{{ info.msg }}</h1>
    <div class="mt-2 flex gap-2">
      <Button variant="outline" @click="router.back()">이전 화면</Button>
      <Button @click="router.push(auth.token ? homePath() : '/login')">대시보드로</Button>
    </div>
  </div>
</template>
