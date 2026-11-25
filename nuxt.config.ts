export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/mdc'],
  ssr: false,
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Server-only. Override with NUXT_* env vars (e.g. NUXT_GEMINI_API_KEY).
    geminiApiKey: '',
    model: 'gemini-3.5-flash-lite',
    liveModel: 'gemini-3.8-live',
    auth: {
      secret: '',
      googleClientId: '',
      googleClientSecret: '',
    },
    gcp: {
      project: '',
      location: 'us-central1',
      // projects/{p}/locations/{l}/reasoningEngines/{id} — enables Memory Bank + sandboxes
      engine: '',
      shellTemplate: '',
      browserTemplate: '',
      // Service account used to sign sandbox data-plane tokens (computer use)
      serviceAccount: '',
      bucket: '',
    },
    public: {
      auth: false,
    },
  },
  compatibilityDate: '2026-11-01',
  nitro: {
    preset: 'node-server',
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
  icon: {
    // SPA: bundle icons into the client instead of fetching them at runtime.
    clientBundle: {
      scan: true,
      icons: ['lucide:mic', 'lucide:audio-lines', 'lucide:square-pen', 'lucide:x', 'lucide:log-out', 'simple-icons:google'],
    },
  },
})
