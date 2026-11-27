<script setup>
import { onMounted, ref } from 'vue'

/**
 * Kokonut UI "Marker Text" (Vue 3 port).
 * Draws an organic hand-drawn highlighter or underline sweep across key text.
 */
const props = defineProps({
  type: { type: String, default: 'highlight' }, // 'highlight' | 'underline'
  color: { type: String, default: 'rgba(56, 189, 248, 0.36)' }, // cyan highlight default
  delay: { type: Number, default: 260 }, // ms
})

const drawn = ref(false)

onMounted(() => {
  setTimeout(() => {
    drawn.value = true
  }, props.delay)
})
</script>

<template>
  <span class="relative inline-block px-1">
    <span class="relative z-10"><slot /></span>

    <!-- Highlighter sweep behind text -->
    <svg
      v-if="type === 'highlight'"
      class="pointer-events-none absolute inset-x-[-2px] bottom-[1px] top-[2px] z-0 h-[calc(100%-2px)] w-[calc(100%+4px)] overflow-visible"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M2,13 C24,10 74,11 98,12"
        fill="none"
        :stroke="color"
        stroke-width="20"
        stroke-linecap="round"
        pathLength="100"
        class="marker-stroke"
        :class="{ 'is-drawn': drawn }"
      />
    </svg>

    <!-- Hand-drawn underline -->
    <svg
      v-else
      class="pointer-events-none absolute inset-x-0 -bottom-[2px] z-10 h-[7px] w-full overflow-visible"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M1,6 Q35,2 68,5 T99,4"
        fill="none"
        :stroke="color"
        stroke-width="2.6"
        stroke-linecap="round"
        pathLength="100"
        class="marker-stroke"
        :class="{ 'is-drawn': drawn }"
      />
    </svg>
  </span>
</template>

<style scoped>
.marker-stroke {
  stroke-dasharray: 102;
  stroke-dashoffset: 102;
  transition: stroke-dashoffset 680ms cubic-bezier(0.22, 1, 0.36, 1);
}
.marker-stroke.is-drawn {
  stroke-dashoffset: 0;
}
@media (prefers-reduced-motion: reduce) {
  .marker-stroke {
    stroke-dashoffset: 0;
    transition: none;
  }
}
</style>
