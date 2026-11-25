<script setup lang="ts">
const { model, models } = useModels()
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="models"
    :loading="!models.length"
    size="sm"
    icon="i-simple-icons-googlegemini"
    color="neutral"
    variant="ghost"
    value-key="value"
    placeholder="Model"
    :search-input="{ placeholder: 'Search Gemini models...' }"
    class="data-[state=open]:bg-elevated"
    :content="{ align: 'end' }"
    :ui="{
      content: 'min-w-56',
      trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
    }"
  />
</template>
