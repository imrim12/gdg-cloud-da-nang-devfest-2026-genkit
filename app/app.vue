<script setup lang="ts">
const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'Genkit Chat'
const description = 'A ChatGPT-style agent built with Genkit, Gemini, Nuxt UI and Cloud Run. GDG Cloud Đà Nẵng DevFest 2026.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary'
})
</script>

<template>
  <UApp
    :toaster="{ position: 'top-right' }"
    :tooltip="{ delayDuration: 200 }"
  >
    <NuxtLoadingIndicator color="var(--ui-primary)" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
