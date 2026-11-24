<script setup>
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'
import PageErrorPanel from './components/PageErrorPanel.vue'
import Toaster from './components/ui/Toaster.vue'
import { pageError } from './lib/state'

const route = useRoute()
</script>

<template>
  <!-- 첫 라우트가 정해지기 전에는 그리지 않는다 (로그인 화면에서 AppShell이 잠깐 떠 401을 내던 것) -->
  <template v-if="!route.matched.length" />
  <RouterView v-else-if="route.meta.bare" />
  <AppShell v-else>
    <PageErrorPanel v-if="pageError.status !== null" />
    <RouterView v-else :key="route.path + '#' + pageError.retryKey" />
  </AppShell>
  <Toaster />
</template>
