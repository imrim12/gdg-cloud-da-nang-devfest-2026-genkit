/** Each Google Cloud feature turns on once its configuration is present. */
export function features() {
  const { gcp } = useRuntimeConfig()
  return {
    memory: !!gcp.engine,
    code: !!gcp.engine,
    shell: !!(gcp.engine && gcp.shellTemplate),
    browser: !!(gcp.engine && gcp.browserTemplate && gcp.serviceAccount),
    files: !!gcp.bucket
  }
}

/** Memory routes need Memory Bank (NUXT_GCP_ENGINE). */
export function requireMemory() {
  if (!features().memory) throw createError({ statusCode: 503, statusMessage: 'Memory needs Agent Platform Memory Bank (NUXT_GCP_ENGINE)' })
}
