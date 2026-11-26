<script setup lang="ts">
defineProps<{
  sections: { label: string, value: string }[]
  saving?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{ save: [], cancel: [] }>()

const fact = defineModel<string>('fact', { required: true })
const section = defineModel<string>('section', { required: true })
</script>

<template>
  <div class="flex-1 flex flex-col gap-2">
    <UTextarea
      v-model="fact"
      autofocus
      autoresize
      :rows="1"
      :maxlength="2000"
      :placeholder="placeholder"
      class="w-full"
      @keydown.enter.exact.prevent="emit('save')"
      @keydown.esc.prevent="emit('cancel')"
    />
    <div class="flex items-center gap-2">
      <USelect
        v-model="section"
        :items="sections"
        size="xs"
        class="w-44"
      />
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ms-auto"
        @click="emit('cancel')"
      />
      <UButton
        label="Save"
        size="xs"
        :loading="saving"
        :disabled="!fact.trim()"
        @click="emit('save')"
      />
    </div>
  </div>
</template>
