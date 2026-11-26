<script setup lang="ts">
const { settings, update } = useSettings()

const instructions = ref(settings.value?.instructions ?? '')
watch(() => settings.value?.instructions, (value) => {
  instructions.value = value ?? ''
})

const dirty = computed(() => instructions.value !== (settings.value?.instructions ?? ''))
const saving = ref(false)

async function save() {
  saving.value = true
  await update({ instructions: instructions.value })
  saving.value = false
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div>
      <h3 class="font-semibold text-highlighted">
        Instructions
      </h3>
      <p class="text-sm text-muted">
        The assistant keeps these in mind in every chat: how to answer, what to call you, what to avoid.
      </p>
    </div>
    <UTextarea
      v-model="instructions"
      :rows="6"
      autoresize
      :maxrows="14"
      :maxlength="8000"
      placeholder="e.g. Keep explanations brief and to the point. Answer in Vietnamese unless I write in English."
      class="w-full"
    />
    <div class="flex justify-end gap-2">
      <UButton
        v-if="dirty"
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="instructions = settings?.instructions ?? ''"
      />
      <UButton
        label="Save"
        :disabled="!dirty"
        :loading="saving"
        @click="save"
      />
    </div>
  </div>
</template>
