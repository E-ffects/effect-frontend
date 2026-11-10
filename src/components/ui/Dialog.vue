<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'

const open = defineModel('open', { type: Boolean, default: false })
defineProps({ title: String, description: String, width: { type: String, default: 'max-w-xl' } })

function onKey(e) {
  if (e.key === 'Escape') open.value = false
}
watch(open, (v) => (v ? addEventListener('keydown', onKey) : removeEventListener('keydown', onKey)), { immediate: true })
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="transition">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @mousedown.self="open = false">
        <div :class="width" class="relative w-full max-h-[88vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg">
          <button class="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="닫기" @click="open = false">
            <X class="size-4" />
          </button>
          <div v-if="title" class="mb-4 pr-6">
            <h2 class="text-base font-semibold">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
          </div>
          <slot />
          <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2"><slot name="footer" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
