export default defineNuxtPlugin(async () => {
  await useUserSession().fetchSession().catch(error => console.error('Could not load the session', error))
})
