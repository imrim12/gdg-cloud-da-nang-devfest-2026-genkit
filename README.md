# Build a ChatGPT-style agent with Genkit, Gemini and Cloud Run

**GDG Cloud Đà Nẵng · DevFest 2026 codelab**

You will deploy a ChatGPT/Claude-style AI app to **your own Google Cloud project**, entirely from **Cloud Shell**,
and every step is copy/paste. What you get:

- **Chat that streams**, with the model's thinking, tool calls and sources shown as it works
- **Any Gemini model**, picked from a list loaded live from the Gemini API
- **History** in Firestore: sidebar, search, rename, delete, share, edit, regenerate and votes. Titles are written by a Genkit flow.
- **Tools:** exact maths (`calculate`), web search, files, plus Python, shell and a browser when Agent Platform is enabled
- **Canvas:** ask for an app or page, watch the code being written, then use it live in a side panel
- **Memory** like Claude's: learns from chats with Agent Platform **Memory Bank**, searches your earlier chats,
  and has a memory manager to view, add, edit, delete or import memories; plus custom instructions
- **Connectors**: Gmail, Google Drive, Docs and Sheets through Google's remote **MCP** servers, with standard MCP OAuth
- **Voice mode** with the Gemini Live API, and optional **Sign in with Google**

**Stack:** Nuxt 4 + [Nuxt UI chat template](https://ui.nuxt.com/templates) · Genkit (flows, tools, middleware) ·
Gemini API + Live API · Cloud Run (scales to zero) · Firestore · Secret Manager · Cloud Storage ·
Agent Platform (Memory Bank, sandboxes) · GitHub Actions

```
Browser (Nuxt UI + AI SDK) ──stream──▶ Cloud Run: Nuxt server + Genkit flows ──▶ Gemini API
   │                                        │   chat · title · canvas         (Google Search grounding)
   │                                        ├─▶ Firestore (chats)      ├─▶ Cloud Storage (files)
   │                                        ├─▶ Agent Platform (Memory Bank, Python / shell / browser sandboxes)
   │                                        └─▶ Google Workspace MCP servers (Gmail, Drive, Docs, Sheets; OAuth)
   └──voice (WebSocket, one-time token)──▶ Gemini Live API
```

| Part | What you get | Time |
| --- | --- | --- |
| [0. Before you start](#0-before-you-start) | Project, billing, Gemini API key | 5 min |
| [1. Set up Cloud Shell](#1-set-up-cloud-shell) | Code and variables | 3 min |
| [2. Run it in Cloud Shell](#2-run-it-in-cloud-shell-with-the-genkit-developer-ui) | Local app + **Genkit Developer UI** | 10 min |
| [3. Deploy to Cloud Run](#3-deploy-to-cloud-run) | **Your public URL**, with history in Firestore | 10 min |
| [4. Files on Cloud Storage](#4-optional-files-on-cloud-storage) (optional) | Uploads and the `save` tool | 3 min |
| [5. Memory, Python, shell, browser](#5-optional-memory-python-shell-and-browser-with-agent-platform) (optional) | Agent Platform tools, canvas self-check | 10 min |
| [6. Sign in with Google](#6-optional-sign-in-with-google) (optional) | History across devices | 5 min |
| [6b. Connectors](#6b-optional-connectors-gmail-drive-docs-sheets-over-mcp) (optional) | Gmail, Drive, Docs, Sheets over MCP | 5 min |
| [7. Add your own tool](#7-add-your-own-genkit-tool) | A `weather` tool | 5 min |
| [8. Deploy on every merged PR](#8-optional-deploy-on-every-merged-pr-with-github-actions) (optional) | GitHub Actions CI/CD | 10 min |
| [9. Clean up](#9-clean-up) | No surprise bills | 2 min |

---

## 0. Before you start

1. **A Google Cloud project with billing enabled.** Use event credits if you have them, or create a project
   at [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate) and link a
   billing account. Cloud Run scales to zero, so an idle demo costs close to nothing.
2. **A Gemini API key on that billing project:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   → **Create API key** → pick **the same project**.
   > ⚠️ A free-tier key allows about **20 requests per day per model**, and one agent turn uses several (each
   > tool round, the title, search). Web search does not work at all on the free tier (`429 RESOURCE_EXHAUSTED`).
   > Use a key from a project with billing.
3. You are an **Owner** (or Editor + Security Admin) of the project.

## 1. Set up Cloud Shell

Open **[Cloud Shell](https://shell.cloud.google.com/?show=terminal)** and paste, replacing the project ID:

```bash
export PROJECT_ID=your-project-id        # ← change me
export REGION=asia-southeast1            # Singapore, closest to Đà Nẵng
gcloud config set project $PROJECT_ID
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export RUNTIME_SA=agent-runtime@$PROJECT_ID.iam.gserviceaccount.com
export URL=https://agent-$PROJECT_NUMBER.$REGION.run.app
echo "project=$PROJECT_ID number=$PROJECT_NUMBER region=$REGION url=$URL"
```

Paste your Gemini API key when asked (it is not shown, and not saved to disk):

```bash
read -rsp "Gemini API key: " GEMINI_API_KEY && export GEMINI_API_KEY && echo " ok"
```

Get the code:

```bash
git clone https://github.com/imrim12/gdg-cloud-da-nang-devfest-2026-genkit
cd gdg-cloud-da-nang-devfest-2026-genkit
```

> Cloud Shell resets environment variables when it reconnects. If a command complains about an empty
> `$PROJECT_ID`, paste the two blocks above again (skip the `git clone`).

## 2. Run it in Cloud Shell, with the Genkit Developer UI

Check Node (Nuxt 4 needs 20.19 or newer; 22 recommended):

```bash
node -v || true
# only if it is older than v20.19:
nvm install 22 && nvm use 22
```

Install, build, and start the app under the Genkit CLI, which adds the **Developer UI** on port 4000:

```bash
npm ci
npm run build
PORT=8080 NUXT_GEMINI_API_KEY=$GEMINI_API_KEY npx -y genkit-cli start --non-interactive -- node .output/server/index.mjs
```

1. **The app:** Cloud Shell toolbar → **Web Preview** (the `<>` eye icon) → **Preview on port 8080**. Try the
   suggestions on the home page:
   - `Saving 5M VND a month at 6%: total after 10 years?`: a **calculate** card appears
   - `Make a Pomodoro timer app`: the **canvas** opens, the code streams in, then the app runs in the side panel
   - Pick another model in the prompt (the list comes from the Gemini API), or turn off **Extended thinking** in the `+` menu.

   Locally, chats are kept in memory; part 3 stores them in Firestore.
2. **The Genkit Developer UI:** **Web Preview → Change port → `4000`**.
   - Send one message in the app first: Genkit loads with the first request.
   - **Flows**: run each flow on its own.
     - `title`: `{ "message": "Help me plan a weekend in Hội An" }`
     - `chat`: `{ "chatId": "devui", "userId": "me", "messages": [{ "role": "user", "content": [{ "text": "What is 2^64?" }] }] }`
     - `canvas`: `{ "chatId": "devui", "userId": "me", "request": "A countdown to DevFest Đà Nẵng 2026" }`
   - **Traces**: open a run to see every model call, tool request and response, retries, tokens and latency.
   - **Models / Tools**: call a Gemini model or a single tool (try `calculate`) on its own.

Stop it with **Ctrl+C** before continuing.

**Where the Genkit code lives:**

| File | What it does |
| --- | --- |
| `server/genkit/index.ts` | `genkit({ plugins: [googleAI()] })`, plus model middleware: `retry`, `fallback` to another Gemini model, and thinking levels |
| `server/flows/chat.ts` | The agent: `ai.generateStream({ tools, maxTurns })`, streaming text, thoughts, tool calls and results |
| `server/flows/title.ts` | A short title from the first message, with structured output (`output: { schema }`) |
| `server/flows/canvas.ts` | Writes a web app as structured output, streams it, and self-checks it in a sandbox browser when available |
| `server/flows/memory.ts` | `memoryEdit`: turns "I moved to Hà Nội" into memory edits, with structured output |
| `server/tools/*.ts` | `calculate` (mathjs), `search` (Google Search grounding), `canvas`, `python`, `shell`, `browse`, `save`, `search_chats` / `recent_chats` (earlier chats), `memory` |
| `server/utils/memory.ts` | Memory Bank: list, recall, create, edit, delete, generate (learn from a turn) and import |
| `server/utils/mcp.ts` | A small MCP client: Streamable HTTP, and the MCP authorization flow (discovery, PKCE, refresh) |
| `server/utils/connectors.ts` | The Google connector catalog, per-user tokens, and MCP tools as Genkit `dynamicTool`s |
| `server/api/chats/[id].post.ts` | Runs the chat flow and turns its events into the AI SDK stream that the Nuxt UI chat components render |

## 3. Deploy to Cloud Run

Enable the APIs (about 1 minute):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com
```

Create the **Firestore** database for chat history (Native mode, in your region):

```bash
gcloud firestore databases create --database="(default)" --location=$REGION --type=firestore-native
```

Store the Gemini key in **Secret Manager**, so it never sits in an env var or in the image:

```bash
printf %s "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --replication-policy=automatic --data-file=-
```

Create a **service account** for the app, which can read that secret and use Firestore:

```bash
gcloud iam service-accounts create agent-runtime --display-name="Agent (Cloud Run runtime)"
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/datastore.user --condition=None
```

Let **Cloud Build** build your source (new projects build as the Compute Engine default service account):

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/run.builder --condition=None
```

**Deploy.** Cloud Build builds the `Dockerfile`, pushes the image to Artifact Registry and starts the
service (3–5 minutes):

```bash
gcloud run deploy agent --source . --region $REGION \
  --service-account $RUNTIME_SA \
  --set-secrets NUXT_GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars "NUXT_GCP_PROJECT=$PROJECT_ID,NUXT_GCP_FIRESTORE=(default)" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --cpu-boost --timeout 900 --quiet
```

| Flag | Why |
| --- | --- |
| `--min-instances 0` | Scale to zero: no requests, no instances, no cost |
| `--max-instances 2` | Caps cost if someone finds your URL |
| `--cpu-boost` | Extra CPU while starting, for faster cold starts |
| `--timeout 900` | An agent turn can call up to 10 tools in a row, and a canvas takes a minute or two |
| `--set-secrets` | Mounts the secret as `NUXT_GEMINI_API_KEY` at runtime |
| `NUXT_GCP_FIRESTORE` | Stores chats in Firestore instead of memory |

Open **`$URL`** (`echo $URL`). Your chats now survive restarts and scale to zero.

🎤 **Voice:** in Chrome, click the microphone in an empty prompt and talk. The browser gets a one-time token
from `/api/voice` and talks to the Gemini Live API directly.

### Change the Gemini API key

The key lives in Secret Manager as `gemini-api-key`. To switch keys (for example to one from a billing
project), add a new **version** of the secret, then roll out a new revision. Cloud Run reads `:latest`
only when an instance starts.

```bash
read -rsp "New Gemini API key: " KEY && echo
printf %s "$KEY" | gcloud secrets versions add gemini-api-key --data-file=-
unset KEY
gcloud run services update agent --region $REGION --update-secrets NUXT_GEMINI_API_KEY=gemini-api-key:latest
```

Optionally, disable the old key's version (check its number first):

```bash
gcloud secrets versions list gemini-api-key
gcloud secrets versions disable 1 --secret gemini-api-key
```

In the Console instead: **Secret Manager → `gemini-api-key` → New version**, then
**Cloud Run → `agent` → Edit & deploy new revision → Deploy**. Later deploys, including GitHub Actions,
use `gemini-api-key:latest`, so they pick up the new key automatically.

## 4. (Optional) Files on Cloud Storage

Turns on **file uploads** (images, PDF, CSV: the `+` menu or drag and drop) and the `save` tool.

```bash
gcloud storage buckets create gs://$PROJECT_ID-agent-files --location=$REGION --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$PROJECT_ID-agent-files \
  --member=serviceAccount:$RUNTIME_SA --role=roles/storage.objectUser
gcloud run services update agent --region $REGION --update-env-vars NUXT_GCP_BUCKET=$PROJECT_ID-agent-files
```

Try: attach a photo of a menu and ask `How much is this order with 10% tax?`, or
`Make a 3-day Đà Nẵng itinerary and save it as itinerary.md`.

## 5. (Optional) Memory, Python, shell and browser with Agent Platform

Creates an Agent Platform engine with **Memory Bank** plus **code execution**, **shell** and **computer use**
sandbox templates. These features are newer, so we use `us-central1` for them; the app stays in Singapore.
With the browser sandbox, **canvas** also opens each app in a real browser, screenshots it, and fixes console errors.

```bash
export AGENT_REGION=us-central1
gcloud services enable aiplatform.googleapis.com
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/aiplatform.user --condition=None
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member=serviceAccount:$RUNTIME_SA --role=roles/iam.serviceAccountTokenCreator
```

Create the engine (2–5 minutes; needs `npm ci` from part 2). Run it **once**: every run creates a new engine.

```bash
npx -y tsx scripts/setup.ts $PROJECT_ID $AGENT_REGION | tee agent-platform.env
```

> If it fails with a credentials error, run `gcloud auth application-default login`, then run it again.

Give the app the engine:

```bash
gcloud run services update agent --region $REGION \
  --update-env-vars "$(grep '^NUXT_' agent-platform.env | paste -sd, -),NUXT_GCP_SERVICE_ACCOUNT=$RUNTIME_SA"
```

Try, in new chats:

- `Remember that my favourite food is mì Quảng`, then in a **new chat**: `What should I eat for lunch?`
- **Settings → Memory → Open**: the memory manager. Memory Bank sorts memories into topics (Profile, Preferences,
  Skills & interests, Projects...). Edit or delete one, add your own, or type `I moved to Hà Nội` in
  *Tell the assistant what to change*.
- **Settings → Memory → Start import**: copy the prompt into ChatGPT or Gemini, paste the answer back, and
  Memory Bank extracts the facts and merges them with what it already knows.
- `Use Python to plot y = sin(x) * x and give me the PNG`
- `Use the shell: what OS and CPU are you running on?`
- `Browse to developers.google.com/community/gdg and tell me what's on the page`

**Memory, like Claude's** (Settings → Memory):

| Setting | How it works |
| --- | --- |
| Search and reference chats | The agent gets `search_chats` and `recent_chats` tools over your own history (works without Agent Platform) |
| Generate memory from chats | After each turn, `memories:generate` extracts and consolidates facts in the background; new chats start with them |
| Assistant's memory | Lists memories by topic (`memories:retrieve`), edits them (`create`, `patch`, `delete`), or applies a request in plain words with the `memoryEdit` flow |
| Import memory | Sends the pasted text to `memories:generate`, so Memory Bank does the extraction, topics and de-duplication |

Memory Bank sorts memories into the topics in `shared/utils/memory.ts`. The app adds them to the engine by
itself the first time memory is used, so engines created before this feature need nothing extra.

## 6. (Optional) Sign in with Google

Visitors are anonymous by default, identified by a cookie. With sign-in, history follows people across
devices; chats made before signing in move to the account.

Google has no command line for creating OAuth clients, so this is the one Console step (2 minutes):

```bash
echo "Branding:  https://console.cloud.google.com/auth/branding?project=$PROJECT_ID"
echo "Client:    https://console.cloud.google.com/auth/clients/create?project=$PROJECT_ID"
echo "Origin:    $URL"
echo "Redirect:  $URL/api/auth/callback/google"
```

1. **Branding** (once per project): an app name and support email, then **Audience: External**.
2. **Clients → Create client → Web application**: paste the **Origin** under *Authorized JavaScript origins*
   and the **Redirect** under *Authorized redirect URIs* → **Create**.

Paste the client ID and secret, and store them in Secret Manager with a random session secret:

```bash
read -rp "Client ID: " CLIENT_ID && read -rsp "Client secret: " CLIENT_SECRET && echo
printf %s "$CLIENT_ID" | gcloud secrets create auth-google-client-id --data-file=-
printf %s "$CLIENT_SECRET" | gcloud secrets create auth-google-client-secret --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create auth-secret --data-file=-
for secret in auth-google-client-id auth-google-client-secret auth-secret; do
  gcloud secrets add-iam-policy-binding $secret \
    --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor >/dev/null
done
unset CLIENT_SECRET
gcloud run services update agent --region $REGION \
  --update-secrets NUXT_AUTH_SECRET=auth-secret:latest,NUXT_AUTH_GOOGLE_CLIENT_ID=auth-google-client-id:latest,NUXT_AUTH_GOOGLE_CLIENT_SECRET=auth-google-client-secret:latest \
  --update-env-vars NUXT_PUBLIC_AUTH=true,BETTER_AUTH_URL=$URL
```

Open **`$URL`** (this exact address) → **Sign in with Google** at the bottom of the sidebar.

## 6b. (Optional) Connectors: Gmail, Drive, Docs, Sheets over MCP

Google runs remote **MCP servers** for Workspace (`gmailmcp.googleapis.com`, `drivemcp`, `docsmcp`, `sheetsmcp`).
The app connects to them with the standard **MCP authorization** flow:

1. It reads the server's Protected Resource Metadata (`/.well-known/oauth-protected-resource/mcp/v1`), which
   names `accounts.google.com` as the authorization server, then that server's metadata.
2. Google has no dynamic client registration, so the app uses its own OAuth client from part 6 (the MCP spec
   allows a pre-registered client). Servers that support registration get a client automatically.
3. Authorization code with **PKCE** in a popup, asking only for the scopes the connector needs. Tokens are
   encrypted in Firestore and refreshed when they expire; disconnecting revokes them.
4. In chats, each enabled connector's tools become Genkit tools (`gmail_search_threads`, `drive_read_file_content`...).
   Turn them on or off in the prompt's `+` menu → **Connectors**.

Needs part 6 (Sign in with Google). Enable each product's API and its MCP service:

```bash
gcloud services enable gmail.googleapis.com drive.googleapis.com docs.googleapis.com sheets.googleapis.com
gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com docsmcp.googleapis.com sheetsmcp.googleapis.com
```

> The Workspace MCP servers are in **Developer Preview**. If the second command fails, join the
> [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview) and run it again.

In the Console, on your OAuth client:

```bash
echo "Client:     https://console.cloud.google.com/auth/clients?project=$PROJECT_ID"
echo "Redirect:   $URL/api/connectors/callback"
echo "Test users: https://console.cloud.google.com/auth/audience?project=$PROJECT_ID"
```

1. **Clients** → your client → add the **Redirect** under *Authorized redirect URIs* → **Save**.
2. **Audience → Test users**: add the Google accounts that will connect. Gmail and Drive scopes are *restricted*,
   so until Google verifies the app only test users can grant them (and see an "unverified app" screen).

No redeploy needed. Open **Settings → Connectors → Connect**, then try:

- `Summarize my unread emails from today and draft a reply to the most urgent one`
- `Find my DevFest slides in Drive and list the speakers`
- `Read the "Budget 2026" sheet and chart spending by month` (with canvas)

## 7. Add your own Genkit tool

Give the agent live weather, from the free [Open-Meteo](https://open-meteo.com) API (no key needed).

```bash
cat > server/tools/weather.ts <<'EOF'
import { z } from 'genkit'
import { defineTool } from '../genkit'

/** Current weather for a city, from the free Open-Meteo API (no key needed). */
export const weather = defineTool(
  {
    name: 'weather',
    description: 'Get the current weather for a city.',
    inputSchema: z.object({ city: z.string().describe('City name, e.g. "Da Nang"') })
  },
  async ({ city }) => {
    const geo = await $fetch<{ results?: { name: string, country: string, latitude: number, longitude: number }[] }>(
      'https://geocoding-api.open-meteo.com/v1/search', { query: { name: city, count: 1 } })
    const place = geo.results?.[0]
    if (!place) return { error: `City not found: ${city}` }
    const { current } = await $fetch<{ current: Record<string, number> }>('https://api.open-meteo.com/v1/forecast', {
      query: { latitude: place.latitude, longitude: place.longitude, current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation' }
    })
    return { place: `${place.name}, ${place.country}`, ...current }
  }
)
EOF
```

Register it with the agent:

```bash
sed -i "s#^import { shell } from './shell'#import { shell } from './shell'\nimport { weather } from './weather'#; s#^    calculate,#    calculate,\n    weather,#" server/tools/index.ts
cat server/tools/index.ts
```

Test it locally (Web Preview → port 8080, Dev UI → port 4000), then **Ctrl+C**:

```bash
npm run build && PORT=8080 NUXT_GEMINI_API_KEY=$GEMINI_API_KEY npx -y genkit-cli start --non-interactive -- node .output/server/index.mjs
```

Ask: `Should I go to Mỹ Khê beach right now?`. The model decides to call `weather` with `{ "city": "Da Nang" }`,
and the call shows up as a card in the chat. In the Dev UI, **Tools → weather** runs the tool on its own. Ship it:

```bash
gcloud run deploy agent --source . --region $REGION --quiet
```

(Settings such as the secrets, service account and env vars are kept from the previous revision.)

## 8. (Optional) Deploy on every merged PR with GitHub Actions

`.github/workflows/deploy.yml` lints, typechecks, builds the image and deploys to Cloud Run **when a pull request
is merged into `main`** (or when you click **Run workflow**). GitHub signs in to Google Cloud with
**Workload Identity Federation**: no service account keys, and only your repository is trusted.

1. **Fork** this repository on GitHub, then in your fork open the **Actions** tab and click
   **I understand my workflows, go ahead and enable them**.
2. In Cloud Shell, run the one-time setup with **your fork's name**. It is safe to re-run, and it reuses what
   parts 3–6 created. Add `--auth` to be walked through part 6, or `--agent-platform` for part 5:
   ```bash
   bash scripts/cloud-run-setup.sh $PROJECT_ID YOUR_GITHUB_USER/gdg-cloud-da-nang-devfest-2026-genkit $REGION
   ```
   It creates an Artifact Registry repo, an `agent-deployer` service account and a Workload Identity pool,
   checks Firestore, the bucket and the secrets, then prints the variables to set.
3. In your fork: **Settings → Secrets and variables → Actions → Variables** → add `GCP_PROJECT`,
   `GCP_PROJECT_NUMBER` and `GCP_REGION`.
   - If you did part 5, also add `NUXT_GCP_LOCATION`, `NUXT_GCP_ENGINE`, `NUXT_GCP_SHELL_TEMPLATE` and `NUXT_GCP_BROWSER_TEMPLATE`, from `cat agent-platform.env`.
   - If you did part 6, also add `AUTH_URL` = `$URL`.
   - The workflow sets every env var on each deploy, so a missing variable turns its feature off.
4. Make a change on a branch and open a PR. For example, on GitHub edit `server/flows/chat.ts` and
   change `You are a knowledgeable, friendly AI assistant` to `You are a friendly guide to Đà Nẵng` →
   **Create a new branch** → **Propose changes**.
   - ⚠️ On the PR page, set **base repository** to **your fork** (GitHub suggests the original repo).
5. **Merge** the PR → **Actions** → **Deploy**. The URL is in the run summary.

## 9. Clean up

Easiest, if you created the project only for this codelab:

```bash
gcloud projects delete $PROJECT_ID
```

Or delete just what you created:

```bash
gcloud run services delete agent --region $REGION --quiet
gcloud artifacts repositories delete cloud-run-source-deploy --location $REGION --quiet
gcloud firestore databases delete --database="(default)" --quiet
gcloud secrets delete gemini-api-key --quiet
gcloud storage rm -r gs://$PROJECT_ID-agent-files                    # part 4 / 8
for secret in auth-secret auth-google-client-id auth-google-client-secret; do
  gcloud secrets delete $secret --quiet                              # part 6
done
gcloud artifacts repositories delete agent --location $REGION --quiet # part 8
# part 5: the Agent Platform engine, with its memories and sandboxes
source agent-platform.env && curl -X DELETE -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://$NUXT_GCP_LOCATION-aiplatform.googleapis.com/v1beta1/$NUXT_GCP_ENGINE?force=true"
```

Also delete your Gemini API key in [AI Studio](https://aistudio.google.com/apikey) and the OAuth client in the
Console if you no longer need them.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `429 RESOURCE_EXHAUSTED ... FreeTier` | Free-tier keys allow ~20 requests per day per model. Use a key from a billing project ([Change the Gemini API key](#change-the-gemini-api-key)). Meanwhile, pick another model in the prompt: each has its own quota, and the app falls back to another model by itself |
| `429 ... (limit: 0 ...)` | That model is not available on your key's tier at all (for example the newest models on a free-tier key). Pick another model, or use a billing key |
| `search` fails with `429` | Google Search grounding needs a key from a project with billing |
| `503 ... experiencing high demand` | Gemini is busy; the app retries and then falls back to another model. If it persists, pick another model |
| A canvas takes a minute or two | It writes a whole app; watch it in the **Code** tab. Turn off **Extended thinking** in the `+` menu for faster replies |
| Chats disappear after a restart | Locally, chats are in memory. On Cloud Run, check `NUXT_GCP_FIRESTORE=(default)` is set and the service account has `roles/datastore.user` |
| Sign-in: `redirect_uri_mismatch` | Open the app at exactly `$URL` (`https://agent-<number>.<region>.run.app`), the address registered in the OAuth client |
| Deploy: `PERMISSION_DENIED` from Cloud Build | Re-run the `roles/run.builder` command in part 3 and wait a minute |
| Deploy: `allUsers ... permitted customer` (organization policy) | Your organization blocks public services. Deploy without `--allow-unauthenticated`, then `gcloud run services proxy agent --region $REGION --port 8080` and use Web Preview on 8080 |
| Variables are empty after Cloud Shell reconnects | Paste the blocks from part 1 again |
| Dev UI shows no flows | Send one chat message in the app first; Genkit loads with the first request |
| Logs | `gcloud run services logs read agent --region $REGION --limit 50` |

---

## Reference

| Feature | How |
| --- | --- |
| UI | [Nuxt UI chat template](https://github.com/nuxt-ui-templates/chat): `UChatMessages`, `UChatPrompt`, `UChatTool`, `UChatReasoning`, `UDashboard*` |
| Streaming | `chat` flow events → AI SDK UI message stream (`createUIMessageStream`) → `useChat` from `@ai-sdk/vue` |
| Models | `GET /api/models`: Gemini models from the API that support `generateContent`, without TTS, image, robotics and similar |
| Titles | `title` flow on a small model, in parallel with the first reply, pushed to the browser as a `data-chat-title` part |
| History | Firestore: `chats/{id}`, with `messages` and `votes` subcollections (`server/utils/store.ts`); in memory locally |
| Maths | `calculate` tool: mathjs, with functions that could change mathjs itself disabled |
| Web search | `search` tool: Gemini Google Search grounding, with sources |
| Canvas | `canvas` tool → `canvas` flow (structured output, streamed as preliminary tool results). The preview runs in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, so the generated code cannot reach the app's cookies or API |
| Canvas self-check | With the computer use sandbox: Playwright renders the page, screenshots it and collects console errors; one automatic fix |
| Code / shell / browser | Agent Platform sandboxes, one per chat, found again by name after scale to zero |
| Memory | Agent Platform Memory Bank: recalled into the system prompt, generated after each reply |
| Files | Uploads and saved files in Cloud Storage under `users/{userId}/`, served by `/api/files/...` to their owner |
| Voice | Browser → Gemini Live API over WebSocket, with a one-time token from `POST /api/voice` |
| Resilience | Genkit model middleware: drop empty text parts, `retry` on 503, `fallback` to another model on 503/429 |
| Auth | Anonymous cookie by default; Better Auth with Google (stateless cookie sessions) when `NUXT_PUBLIC_AUTH=true` |
| CSRF | API writes must come from the app's own origin (`server/middleware/origin.ts`) |

Each Google Cloud feature turns on when its env vars are set (`server/utils/features.ts`). With only
`NUXT_GEMINI_API_KEY` you get chat, models, titles, calculate, canvas, web search and voice, with history in memory.

### Layout

```
app/                         Nuxt UI chat template (pages, layouts, components, composables)
  components/chat/tool/      Calculate, Canvas, Code (python/shell/browse/save), Sources cards
  components/chat/CanvasPanel.vue   preview / code side panel
  composables/               useModels, useCanvas, useUserSession, useVoice, useFileUpload, ...
server/
  genkit/index.ts            ai, model(), defineTool(), middleware, thinking levels
  flows/                     chat.ts, title.ts, canvas.ts
  tools/                     calculate, search, canvas, python, shell, browse, save
  api/chats/[id].post.ts     chat stream (Genkit → AI SDK UI stream), title, persistence
  api/                       chats CRUD, models, session, upload, files, voice, auth
  utils/                     store (Firestore), user, messages, models, sandbox, memory, bucket, features
shared/                      types and the canvas bundler, used by both sides
scripts/setup.ts             one-time Agent Platform setup
scripts/cloud-run-setup.sh   one-time GitHub Actions → Cloud Run setup (part 8)
.github/workflows/deploy.yml merged PR → Cloud Run
```

### Develop on your machine

```bash
cp .env.example .env   # set NUXT_GEMINI_API_KEY
npm install
npm run dev            # or: npx genkit-cli start -- npm run dev   (Dev UI on :4000)
```

`npm run lint`, `npm run typecheck`, `npm run build`. To try Firestore locally, run the emulator
(`npx firebase-tools emulators:start --only firestore`) and set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`,
`NUXT_GCP_PROJECT=demo-local` and `NUXT_GCP_FIRESTORE=(default)`.

### GitHub Actions variables

Required: `GCP_PROJECT`, `GCP_PROJECT_NUMBER`, `GCP_REGION`. Optional: `NUXT_GCP_LOCATION` (Agent Platform
region, defaults to `GCP_REGION`), `NUXT_GCP_ENGINE`, `NUXT_GCP_SHELL_TEMPLATE`, `NUXT_GCP_BROWSER_TEMPLATE`,
`NUXT_MODEL`, `NUXT_LIVE_MODEL`, `MAX_INSTANCES` (default 3), and `AUTH_URL` (the service URL) to turn on
Google sign-in. Sign-in also needs the `auth-secret`, `auth-google-client-id` and `auth-google-client-secret`
secrets (readable by `agent-runtime`); `scripts/cloud-run-setup.sh ... --auth` creates them.

### Notes

- `/api/voice` and `/api/chat*` are open to any visitor, even with sign-in on. Keep `--max-instances` low or add
  rate limiting before sharing the URL widely.
- Shared chats (the share button) are readable by anyone with the link; their uploaded files stay private.
- Live API ephemeral tokens need the Gemini Developer API key, not Vertex AI.
