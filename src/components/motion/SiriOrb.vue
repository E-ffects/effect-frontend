<script setup>
import { computed } from 'vue'

/**
 * SmoothUI "Siri Orb" (Vue 3 port).
 * Exact 7-layer rotating conic-gradient mesh + blur/contrast/saturate +
 * dot overlay + drifting glassy sheen + lit rim + gentle 5.5s breathing cycle.
 */
const props = defineProps({
  size: { type: Number, default: 112 },
  state: { type: String, default: 'idle' }, // 'idle' | 'thinking'
})

const orbStyle = computed(() => {
  const s = props.size
  const blur = s < 50 ? Math.max(s * 0.008, 1) : Math.max(s * 0.015, 4)
  const contrast = s < 50 ? Math.max(s * 0.004, 1.2) : Math.max(s * 0.008, 1.5)
  const dot = s < 50 ? Math.max(s * 0.004, 0.05) : Math.max(s * 0.008, 0.1)
  const spread = s < 50 ? Math.max(s * 0.004, 0.5) : Math.max(s * 0.008, 2)
  const rim = Math.max(s * 0.06, 1.5)
  const dur = props.state === 'thinking' ? 7 : 18
  const drift = props.state === 'thinking' ? 5 : 12
  return {
    width: `${s}px`,
    height: `${s}px`,
    '--bg': 'oklch(22% 0.04 270)',
    '--c1': 'oklch(72% 0.21 340)', // Magenta-Pink
    '--c2': 'oklch(74% 0.19 205)', // Flowstate Cyan-Blue
    '--c3': 'oklch(66% 0.21 285)', // Violet
    '--c4': 'oklch(74% 0.19 315)', // Bright Orchid
    '--blur-amount': `${blur.toFixed(2)}px`,
    '--contrast-amount': contrast.toFixed(2),
    '--dot-size': `${dot.toFixed(2)}px`,
    '--shadow-spread': `${spread.toFixed(2)}px`,
    '--rim': `${rim.toFixed(2)}px`,
    '--animation-duration': `${dur}s`,
    '--drift-duration': `${drift}s`,
  }
})
</script>

<template>
  <div class="relative inline-flex items-center justify-center">
    <!-- Ambient aura glow -->
    <div
      class="pointer-events-none absolute rounded-full opacity-55 blur-2xl transition-transform duration-700"
      :class="state === 'thinking' ? 'scale-125 opacity-75' : 'scale-100'"
      :style="{
        width: `${size * 1.15}px`,
        height: `${size * 1.15}px`,
        background: 'radial-gradient(circle, rgba(56,189,248,0.45) 0%, rgba(139,92,246,0.28) 55%, transparent 75%)',
      }"
    />

    <!-- Breathing outer wrapper -->
    <div
      class="siri-orb relative grid overflow-hidden rounded-full"
      :class="state === 'thinking' ? 'is-thinking' : 'is-idle'"
      :style="orbStyle"
      aria-hidden="true"
    >
      <div class="siri-orb-layer siri-orb-sheen" />
      <div class="siri-orb-layer siri-orb-rim" />
    </div>
  </div>
</template>

<style scoped>
@property --angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.siri-orb {
  grid-template-areas: 'stack';
  background: radial-gradient(circle, rgba(15, 23, 42, 0.25) 0%, rgba(4, 5, 12, 0.85) 100%);
  box-shadow: 0 12px 34px rgba(56, 189, 248, 0.22);
}

.siri-orb.is-idle {
  animation: siri-breathe 5.5s ease-in-out infinite;
}

.siri-orb.is-thinking {
  animation: siri-pulse 1.8s ease-in-out infinite;
}

.siri-orb::before,
.siri-orb::after,
.siri-orb > .siri-orb-layer {
  content: '';
  display: block;
  grid-area: stack;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.siri-orb::before {
  background:
    conic-gradient(from calc(var(--angle) * 2) at 25% 70%, var(--c3), transparent 20% 80%, var(--c3)),
    conic-gradient(from calc(var(--angle) * 2) at 45% 75%, var(--c2), transparent 30% 60%, var(--c2)),
    conic-gradient(from calc(var(--angle) * -3) at 80% 20%, var(--c1), transparent 40% 60%, var(--c1)),
    conic-gradient(from calc(var(--angle) * 1.5) at 60% 35%, var(--c4), transparent 25% 75%, var(--c4)),
    conic-gradient(from calc(var(--angle) * 2) at 15% 5%, var(--c2), transparent 10% 90%, var(--c2)),
    conic-gradient(from calc(var(--angle) * 1) at 20% 80%, var(--c1), transparent 10% 90%, var(--c1)),
    conic-gradient(from calc(var(--angle) * -2) at 85% 10%, var(--c3), transparent 20% 80%, var(--c3));
  box-shadow: inset var(--bg) 0 0 var(--shadow-spread) calc(var(--shadow-spread) * 0.2);
  filter: blur(var(--blur-amount)) contrast(var(--contrast-amount)) saturate(1.45);
  animation: siri-rotate var(--animation-duration) linear infinite;
}

.siri-orb::after {
  background-image: radial-gradient(circle at center, var(--bg) var(--dot-size), transparent var(--dot-size));
  background-size: calc(var(--dot-size) * 2) calc(var(--dot-size) * 2);
  mix-blend-mode: overlay;
  mask-image: radial-gradient(black 15%, transparent 75%);
}

.siri-orb-sheen {
  background:
    radial-gradient(circle at 30% 24%, hsl(0 0% 100% / 0.34), transparent 36%),
    radial-gradient(circle at 72% 80%, hsl(0 0% 100% / 0.08), transparent 48%);
  mix-blend-mode: screen;
  animation: siri-drift var(--drift-duration) ease-in-out infinite alternate;
}

.siri-orb-rim {
  box-shadow:
    inset 0 0 0 1px hsl(0 0% 100% / 0.2),
    inset 0 calc(var(--rim) * 1) calc(var(--rim) * 2) hsl(0 0% 100% / 0.24),
    inset 0 calc(var(--rim) * -1.2) calc(var(--rim) * 2.4) hsl(0 0% 0% / 0.45);
  pointer-events: none;
}

@keyframes siri-rotate {
  to {
    --angle: 360deg;
  }
}

@keyframes siri-drift {
  0% {
    transform: translate(-6%, -4%) scale(1.05);
  }
  100% {
    transform: translate(7%, 6%) scale(1.12);
  }
}

@keyframes siri-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}

@keyframes siri-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.09);
  }
}

@media (prefers-reduced-motion: reduce) {
  .siri-orb,
  .siri-orb::before,
  .siri-orb-sheen {
    animation: none;
  }
}
</style>
