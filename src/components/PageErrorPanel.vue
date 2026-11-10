<script setup>
// 페이지를 불러오다 서버 오류가 났을 때 페이지 자리에 대신 보여주는 패널 (메뉴는 그대로 남는다)
import { computed } from 'vue'
import { RefreshCw, ServerCrash, WifiOff } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { clearPageError, pageError } from '@/lib/state'

const offline = computed(() => [0, 502, 504].includes(pageError.status))
</script>

<template>
  <div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border bg-card p-10 text-center" role="alert">
    <span class="flex size-14 items-center justify-center rounded-full bg-sk-red/10 text-sk-red">
      <component :is="offline ? WifiOff : ServerCrash" class="size-6" />
    </span>
    <p class="text-sm font-medium text-muted-foreground">{{ pageError.status || '연결 끊김' }} {{ offline ? '서버 연결 실패' : '서버 오류' }}</p>
    <h1 class="text-xl font-semibold">{{ offline ? '서버에 연결할 수 없습니다' : '화면을 불러오지 못했습니다' }}</h1>
    <p class="max-w-md text-sm text-muted-foreground">
      {{ offline ? '서버가 재시작 중이거나 네트워크가 끊겼을 수 있습니다. 잠시 후 다시 시도하세요' : pageError.message }}
    </p>
    <Button class="mt-2" @click="clearPageError(true)"><RefreshCw class="size-4" />다시 시도</Button>
  </div>
</template>
