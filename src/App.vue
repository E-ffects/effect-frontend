<script setup>
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'
import PageErrorPanel from './components/PageErrorPanel.vue'
import Toaster from './components/ui/Toaster.vue'
import { pageError } from './lib/state'

const route = useRoute()
</script>

<template>
  <RouterView v-if="route.meta.bare" />
  <AppShell v-else>
    <PageErrorPanel v-if="pageError.status !== null" />
    <RouterView v-else :key="route.path + '#' + pageError.retryKey" />
  </AppShell>
  <Toaster />
</template>
