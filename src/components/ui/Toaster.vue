<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { X } from 'lucide-vue-next'
import { dismissToast, scheduleDismiss, toasts } from '@/lib/state'

const router = useRouter()
const MAX = 3
const visible = computed(() => toasts.items.slice(-MAX))
const hidden = computed(() => Math.max(0, toasts.items.length - MAX))

const accents = { red: 'border-l-red-500', purple: 'border-l-violet-500', orange: 'border-l-orange-500', green: 'border-l-emerald-500', default: 'border-l-primary' }

function go(t) {
  dismissToast(t.id)
  t.action.onClick?.()
  if (t.action.to) router.push(t.action.to)
}

function hold(t) {
  clearTimeout(t.timer)
}
</script>

<template>
  <div class="fixed bottom-24 right-6 z-[60] flex w-[360px] flex-col gap-2">
    <p v-if="hidden" class="self-end rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">외 {{ hidden }}건</p>
    <TransitionGroup enter-from-class="opacity-0 translate-y-2" enter-active-class="transition" leave-to-class="opacity-0" leave-active-class="transition">
      <div
        v-for="t in visible"
        :key="t.id"
        :class="accents[t.tone] || accents.default"
        class="relative rounded-lg border border-l-4 bg-card p-4 pr-9 shadow-lg"
        @mouseenter="hold(t)"
        @mouseleave="scheduleDismiss(t)"
      >
        <button class="absolute right-3 top-3 opacity-60 hover:opacity-100" aria-label="닫기" @click="dismissToast(t.id)">
          <X class="size-3.5" />
        </button>
        <p class="text-sm font-semibold">{{ t.title }}</p>
        <p v-if="t.description" class="mt-1 text-xs text-muted-foreground">{{ t.description }}</p>
        <button v-if="t.action" class="mt-2 text-xs font-medium underline underline-offset-4" @click="go(t)">{{ t.action.label }}</button>
      </div>
    </TransitionGroup>
  </div>
</template>
