<script setup>
import { Star, Trash2 } from 'lucide-vue-next'
import Badge from './ui/Badge.vue'
import { timeAgo } from '@/lib/api'
import { ALERT_TONE } from '@/lib/badges'

// 알림 한 줄: 누르면 대상으로 이동, 오른쪽 ☆ 즐겨찾기 · 🗑 삭제 (벨 드롭다운과 알림 센터 공용)
// selectable: 알림 센터 일괄 선택용 체크박스 (Gmail처럼 왼쪽)
defineProps({ alert: Object, selectable: Boolean, checked: Boolean })
defineEmits(['open', 'star', 'remove', 'toggle'])
</script>

<template>
  <div :class="checked ? 'bg-brand-soft/60' : 'hover:bg-muted/50'" class="group flex items-start gap-1 pr-2">
    <label v-if="selectable" class="grid shrink-0 cursor-pointer place-items-center self-stretch pl-3 pr-0.5" :title="checked ? '선택 해제' : '선택'">
      <input type="checkbox" class="size-4 cursor-pointer accent-[var(--color-primary)]" :checked="checked" :aria-label="`${alert.target_label} 선택`" @change="$emit('toggle', alert)" />
    </label>
    <button :class="selectable ? 'pl-2' : 'pl-4'" class="flex min-w-0 flex-1 gap-3 py-3 text-left" @click="$emit('open', alert)">
      <span :class="alert.read ? 'bg-transparent' : 'bg-sk-red'" class="mt-1.5 size-1.5 shrink-0 rounded-full" />
      <span class="min-w-0 flex-1 text-xs">
        <span class="flex items-center gap-2">
          <Badge :tone="ALERT_TONE[alert.type]">{{ alert.type }}</Badge>
          <span class="truncate font-semibold">{{ alert.target_label }}</span>
          <span class="ml-auto shrink-0 text-muted-foreground">{{ timeAgo(alert.created_at) }}</span>
        </span>
        <span class="mt-1 block leading-relaxed text-muted-foreground">{{ alert.reason }}</span>
        <span class="mt-0.5 block leading-relaxed"><b class="font-semibold">먼저 확인:</b> {{ alert.check_items }}</span>
      </span>
    </button>
    <!-- ☆는 위, 🗑는 아래 끝: 즐겨찾기를 누르다 실수로 삭제하지 않게 간격을 벌린다 -->
    <span class="flex shrink-0 flex-col justify-between gap-4 self-stretch py-2">
      <button
        class="grid size-7 place-items-center rounded-md hover:bg-muted"
        :class="alert.starred ? 'text-sk-orange' : 'text-[#6f7684] hover:text-sk-orange'"
        :aria-label="alert.starred ? '즐겨찾기 해제' : '즐겨찾기'"
        :title="alert.starred ? '즐겨찾기 해제' : '즐겨찾기'"
        @click="$emit('star', alert)"
      >
        <Star class="size-4" :fill="alert.starred ? 'currentColor' : 'none'" />
      </button>
      <button
        class="grid size-7 place-items-center rounded-md text-[#9aa1ac] hover:bg-muted hover:text-sk-red group-hover:text-[#6f7684]"
        aria-label="알림 삭제"
        title="알림 삭제"
        @click="$emit('remove', alert)"
      >
        <Trash2 class="size-4" />
      </button>
    </span>
  </div>
</template>
