#!/usr/bin/env bash
# One-time Google Cloud setup for deploying with .github/workflows/deploy.yml.
# Safe to re-run: existing resources are kept.
#
#   bash scripts/cloud-run-setup.sh <project> <github-owner/repo> [region] [--agent-platform]
#
# Run it in Cloud Shell (or anywhere `gcloud` is logged in as a project Owner).
# --agent-platform also creates the Agent Platform engine (Memory Bank, code/shell/browser
# sandboxes) with scripts/setup.ts. Only pass it once: each run creates a new engine.
# The engine goes in AGENT_REGION (default: region), e.g. AGENT_REGION=us-central1.
set -euo pipefail

AGENT_PLATFORM=
ARGS=()
for arg in "$@"; do
  if [[ $arg == --agent-platform ]]; then AGENT_PLATFORM=1; else ARGS+=("$arg"); fi
done
PROJECT=${ARGS[0]:-}
REPO=${ARGS[1]:-}
REGION=${ARGS[2]:-us-central1}
AGENT_REGION=${AGENT_REGION:-$REGION}
if [[ -z $PROJECT || $REPO != */* ]]; then
  echo "Usage: bash scripts/cloud-run-setup.sh <project> <github-owner/repo> [region] [--agent-platform]" >&2
  exit 1
fi

# Names the workflow derives from GCP_PROJECT; keep them in sync with deploy.yml.
SERVICE=agent
RUNTIME_SA=agent-runtime@$PROJECT.iam.gserviceaccount.com
DEPLOYER_SA=agent-deployer@$PROJECT.iam.gserviceaccount.com
BUCKET=$PROJECT-agent-files
POOL=github

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
# New service accounts and identity pools take a few seconds to become usable in IAM bindings.
# Errors are only shown if the last attempt fails too.
retry() { for i in 1 2 3 4 5 6; do "$@" >/dev/null 2>&1 && return; sleep $((i * 5)); done; "$@" >/dev/null; }

gcloud config set project "$PROJECT" >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

step "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com secretmanager.googleapis.com \
  aiplatform.googleapis.com storage.googleapis.com cloudresourcemanager.googleapis.com

step "Artifact Registry repository: $SERVICE ($REGION)"
exists gcloud artifacts repositories describe "$SERVICE" --location "$REGION" ||
  gcloud artifacts repositories create "$SERVICE" --location "$REGION" --repository-format docker

step "Service accounts"
exists gcloud iam service-accounts describe "$RUNTIME_SA" ||
  gcloud iam service-accounts create agent-runtime --display-name "Agent (Cloud Run runtime)"
exists gcloud iam service-accounts describe "$DEPLOYER_SA" ||
  gcloud iam service-accounts create agent-deployer --display-name "Agent (GitHub Actions deployer)"

step "Runtime permissions: Agent Platform, own token signing (browse tool)"
retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/aiplatform.user --condition None
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/iam.serviceAccountTokenCreator

step "Files bucket: gs://$BUCKET"
exists gcloud storage buckets describe "gs://$BUCKET" ||
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access
retry gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/storage.objectUser

step "Secret: gemini-api-key"
if ! exists gcloud secrets describe gemini-api-key; then
  read -rsp "Gemini API key (from https://aistudio.google.com/apikey): " KEY && echo
  printf %s "$KEY" | gcloud secrets create gemini-api-key --replication-policy automatic --data-file=-
fi
retry gcloud secrets add-iam-policy-binding gemini-api-key --member "serviceAccount:$RUNTIME_SA" \
  --role roles/secretmanager.secretAccessor

step "Deployer permissions: Cloud Run, push images, act as the runtime account"
retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$DEPLOYER_SA" \
  --role roles/run.admin --condition None
retry gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/artifactregistry.writer
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$DEPLOYER_SA" \
  --role roles/iam.serviceAccountUser

step "Workload Identity Federation: only GitHub repo $REPO can deploy (no keys)"
exists gcloud iam workload-identity-pools describe "$POOL" --location global ||
  gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
exists gcloud iam workload-identity-pools providers describe github --location global --workload-identity-pool "$POOL" ||
  gcloud iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool "$POOL" \
    --display-name "GitHub" --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition "assertion.repository == '$REPO'"
retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"

VARS=(GCP_PROJECT="$PROJECT" GCP_PROJECT_NUMBER="$NUMBER" GCP_REGION="$REGION")
if [[ -n $AGENT_PLATFORM ]]; then
  step "Agent Platform engine in $AGENT_REGION (Memory Bank + sandbox templates)"
  npm ci --ignore-scripts --no-audit --no-fund >/dev/null
  OUTPUT=$(npx -y tsx scripts/setup.ts "$PROJECT" "$AGENT_REGION")
  for name in NUXT_GCP_LOCATION NUXT_GCP_ENGINE NUXT_GCP_SHELL_TEMPLATE NUXT_GCP_BROWSER_TEMPLATE; do
    VARS+=("$(grep "^$name=" <<<"$OUTPUT")")
  done
fi

step "Done. Set these GitHub repository variables (Settings > Secrets and variables > Actions > Variables)"
for var in "${VARS[@]}"; do echo "  $var"; done
echo
echo "Or with the GitHub CLI:"
for var in "${VARS[@]}"; do echo "  gh variable set ${var%%=*} --repo $REPO --body '${var#*=}'"; done
echo
echo "Then push to main (or run the Deploy workflow by hand) to deploy."
