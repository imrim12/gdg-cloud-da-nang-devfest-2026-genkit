# Agent

A ChatGPT-style agent platform: **Nuxt 4 + Nuxt UI + Genkit + Gemini**, deployed to **Cloud Run**.

| Feature | How |
| --- | --- |
| Chat | Genkit flow `server/genkit/flows/chat.ts`, streamed as NDJSON from `POST /api/chat` |
| Web search | `search` tool → Gemini Google Search grounding |
| Code execution | `python` tool → Agent Platform code execution sandbox (one per chat) |
| Shell | `shell` tool → Agent Platform shell sandbox (`/exec`) |
| Computer use | `browse` tool → Playwright over CDP to the Agent Platform computer use sandbox |
| Memory | Agent Platform Memory Bank: recalled into the system prompt, generated after each reply |
| Files | `save` tool + Python output files → Cloud Storage, downloaded via `/api/files/...` |
| Voice | Browser → Gemini Live API over WebSocket, using an ephemeral token from `POST /api/voice` |
| Auth | Better Auth, Google sign-in, stateless (no database). Off by default (`NUXT_PUBLIC_AUTH`) |

Each Google Cloud feature turns on when its env vars are set (`server/utils/features.ts`). With only
`NUXT_GEMINI_API_KEY` you get chat and web search.

## Layout

```
app/
  layouts/default.vue        sidebar (UDashboardGroup/Sidebar) + history
  pages/index.vue            new chat
  pages/chat/[id].vue        conversation
  components/chat/prompt.vue <ChatPrompt>   input + voice + submit
  components/chat/content.vue <ChatContent> markdown + tool calls
  components/app/user.vue    <AppUser>      Google sign-in
  composables/chat.ts        useChat(id)    streaming client
  composables/chats.ts       useChats()     history (localStorage)
  composables/voice.ts       useVoice()     Live API audio
  utils/auth.ts              auth           Better Auth client
server/
  api/chat.post.ts  api/voice.post.ts  api/files/[...path].get.ts  api/auth/[...all].ts
  genkit/index.ts            ai, model()
  genkit/flows/chat.ts       chat flow
  genkit/tools/*.ts          search, python, shell, browse, save
  utils/*.ts                 auth, user, gcp, sandbox, memory, bucket, features
scripts/setup.ts             one-time Agent Platform setup
```

## Develop

```bash
cp .env.example .env   # set NUXT_GEMINI_API_KEY
npm install
npm run dev
```

`npm run lint`, `npm run typecheck`, `npm run build`.

## Google Cloud setup

```bash
gcloud auth application-default login
node scripts/setup.ts <project> us-central1
```

This creates an Agent Platform engine with Memory Bank, plus shell and computer use sandbox templates
(with internet access), and prints the `NUXT_GCP_*` variables. Also create a bucket for `NUXT_GCP_BUCKET`.

The Cloud Run service account needs:

- `roles/aiplatform.user` (sandboxes, Memory Bank)
- `roles/storage.objectUser` on the bucket
- `roles/iam.serviceAccountTokenCreator` on itself, for `browse` (signs sandbox data-plane tokens).
  Set `NUXT_GCP_SERVICE_ACCOUNT` to its email.

## Deploy

```bash
gcloud run deploy agent --source . --region us-central1 \
  --service-account agent@<project>.iam.gserviceaccount.com \
  --set-secrets NUXT_GEMINI_API_KEY=gemini-api-key:latest \
  --env-vars-file env.yaml
```

## Notes

- Chat history is in the browser (localStorage). The chat → sandbox mapping is in Nitro storage, in memory
  per instance by default; mount a shared driver (e.g. Redis) under `sandboxes` to share it across instances.
- `/api/voice` mints Live API tokens for any visitor. Turn on auth or add rate limiting before going public.
- Live API ephemeral tokens need the Gemini Developer API key, not Vertex AI.
