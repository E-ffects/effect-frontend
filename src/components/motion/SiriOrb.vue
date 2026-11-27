<script setup>
import { computed } from 'vue'

/**
 * SmoothUI "Siri Orb" (GPU-composited Vue 3 port for 60fps mobile).
 * Uses pure transform: rotate() on separate compositor layers instead of
 * animating CSS custom properties (--angle) to avoid main-thread repaints.
 */
const props = defineProps({
  size: { type: Number, default: 108 },
  state: { type: String, default: 'idle' }, // 'idle' | 'thinking'
})

const orbStyle = computed(() => {
  const s = props.size
  return {
    width: `${s}px`,
    height: `${s}px`,
    '--dur-a': props.state === 'thinking' ? '4.5s' : '12s',
    '--dur-b': props.state === 'thinking' ? '6.5s' : '17s',
  }
})
</script>

<template>
  <div class="relative inline-flex items-center justify-center" style="contain: layout style">
    <!-- Ambient aura glow (static radial, zero per-frame blur) -->
    <div
      class="pointer-events-none absolute rounded-full transition-transform duration-700"
      :class="state === 'thinking' ? 'scale-115 opacity-80' : 'scale-100 opacity-60'"
      :style="{
        width: `${size * 1.45}px`,
        height: `${size * 1.45}px`,
        background: 'radial-gradient(circle, rgba(56,189,248,0.34) 0%, rgba(139,92,246,0.22) 45%, transparent 72%)',
      }"
    />

    <!-- Breathing outer shell -->
    <div
      class="siri-orb relative overflow-hidden rounded-full"
      :class="state === 'thinking' ? 'is-thinking' : 'is-idle'"
      :style="orbStyle"
      aria-hidden="true"
    >
      <div class="orb-mesh orb-mesh-a" />
      <div class="orb-mesh orb-mesh-b" />
      <div class="orb-sheen" />
      <div class="orb-rim" />
    </div>
  </div>
</template>

<style scoped>
.siri-orb {
  background: radial-gradient(circle at 35% 30%, #1c2444 0%, #090c1a 100%);
  box-shadow: 0 10px 28px rgba(56, 189, 248, 0.24);
  transform: translateZ(0);
  will-change: transform;
}

.siri-orb.is-idle {
  animation: siri-breathe 5.5s ease-in-out infinite;
}

.siri-orb.is-thinking {
  animation: siri-pulse 1.8s ease-in-out infinite;
}

.orb-mesh {
  position: absolute;
  inset: -18%;
  border-radius: 50%;
  filter: blur(8px) saturate(1.4);
  will-change: transform;
}

.orb-mesh-a {
  background:
    conic-gradient(from 0deg at 35% 65%, #38bdf8, transparent 45%, #a855f7 75%, #38bdf8),
    conic-gradient(from 140deg at 70% 30%, #f472b6, transparent 50%, #3b82f6 80%, #f472b6);
  animation: orb-spin var(--dur-a) linear infinite;
}

.orb-mesh-b {
  background:
    conic-gradient(from 90deg at 60% 70%, #22d3ee, transparent 40%, #c084fc 75%, #22d3ee);
  mix-blend-mode: screen;
  opacity: 0.78;
  animation: orb-spin-rev var(--dur-b) linear infinite;
}

.orb-sheen {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.42), transparent 38%),
    radial-gradient(circle at 72% 80%, rgba(255, 255, 255, 0.1), transparent 48%);
  pointer-events: none;
}

.orb-rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.24),
    inset 0 4px 10px rgba(255, 255, 255, 0.24),
    inset 0 -6px 14px rgba(0, 0, 0, 0.48);
  pointer-events: none;
}

@keyframes orb-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes orb-spin-rev {
  to {
    transform: rotate(-360deg);
  }
}

@keyframes siri-breathe {
  0%,
  100% {
    transform: scale(1) translateZ(0);
  }
  50% {
    transform: scale(1.04) translateZ(0);
  }
}

@keyframes siri-pulse {
  0%,
  100% {
    transform: scale(1) translateZ(0);
  }
  50% {
    transform: scale(1.09) translateZ(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .siri-orb,
  .orb-mesh {
    animation: none;
  }
}
</style>
