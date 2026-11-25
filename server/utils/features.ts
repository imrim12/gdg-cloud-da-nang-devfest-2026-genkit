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
