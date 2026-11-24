<script setup>
import { auth } from '@/lib/state'

// 화면 상단: WORKSPACE / 역할 / 화면 이동 경로 + 제목 + 설명 + 우측 동작
// crumb=false: 이동 경로 줄을 숨긴다. 제목 위에 따로 라벨을 두지 않고 제목 크기로 위계를 만든다
defineProps({ title: String, description: String, crumb: { type: Boolean, default: true } })
</script>

<template>
  <div class="mb-7">
    <p v-if="crumb" class="mb-2.5 text-[12px] font-medium tracking-[0.4px] text-muted-foreground">
      WORKSPACE <span class="mx-1 text-border">/</span> {{ auth.user?.role_label }} <span class="mx-1 text-border">/</span> {{ title }}
    </p>
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-balance text-[30px] font-bold leading-[1.25] tracking-[-0.025em] text-[#111]">{{ title }}</h1>
        <p v-if="description || $slots.description" class="mt-2 text-sm font-normal text-muted-foreground"><slot name="description">{{ description }}</slot></p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2"><slot name="actions" /></div>
    </div>
  </div>
</template>
