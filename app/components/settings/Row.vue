<script setup lang="ts">
defineProps<{
  label: string
  description?: string
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-4 border-b border-default last:border-b-0">
    <div class="min-w-0">
      <p class="text-sm font-medium text-highlighted">
        {{ label }}
      </p>
      <p
        v-if="description"
        class="text-sm text-muted"
      >
        {{ description }}
      </p>
      <slot name="description" />
    </div>
    <div class="shrink-0">
      <slot />
    </div>
  </div>
</template>
