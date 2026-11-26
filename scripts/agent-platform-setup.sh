#!/usr/bin/env bash
# Creates the Agent Platform engine (Memory Bank + sandboxes) and the shell / computer use sandbox
# templates, then prints the NUXT_GCP_* variables to set. Needs only gcloud, curl and jq, which
# Cloud Shell has. Safe to re-run: an existing "agent" engine and its templates are reused.
#
#   bash scripts/agent-platform-setup.sh [project] [location] | tee agent-platform.env
#
# project defaults to the gcloud project; location to us-central1. Progress goes to stderr, so
# only the variables end up in agent-platform.env. The app adds the memory topics to the engine
# itself the first time memory is used (server/utils/memory.ts).
set -euo pipefail
# Errors inside $(...) stop the script too
shopt -s inherit_errexit

# With an empty $PROJECT_ID (Cloud Shell forgets variables when it reconnects), the region comes
# first: take it as the region and use the gcloud project.
if [[ ${1:-} =~ ^[a-z]+-[a-z]+[0-9]+$ ]]; then set -- "" "$@"; fi
PROJECT=${1:-$(gcloud config get-value project 2>/dev/null)}
LOCATION=${2:-us-central1}
MODEL=${MODEL:-gemini-3.5-flash-lite}
NAME=agent
API=${AIPLATFORM_API:-https://$LOCATION-aiplatform.googleapis.com/v1beta1}
PARENT=projects/$PROJECT/locations/$LOCATION

if [[ -z $PROJECT || $PROJECT =~ ^[a-z]+-[a-z]+[0-9]+$ ]]; then
  echo "No project (got '${PROJECT}'). Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

log() { printf '%s\n' "$*" >&2; }

# Calls the Agent Platform REST API; exits with Google's message on an error.
api() {
  local method=$1 path=$2 body=${3:-} response
  response=$(curl -sS -X "$method" "$API/$path" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    ${body:+--data "$body"})
  if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
    log "Error from $method $path: $(jq -r '.error.message' <<<"$response")"
    exit 1
  fi
  printf '%s' "$response"
}

# Waits for a long-running operation, showing the time spent; prints the created resource name.
wait_for() {
  local op=$1 what=$2 start=$SECONDS
  while true; do
    local status
    status=$(api GET "$op") || exit 1
    if [[ $(jq -r '.done // false' <<<"$status") == true ]]; then
      printf '\n' >&2
      jq -r '.response.name' <<<"$status"
      return
    fi
    if ((SECONDS - start > 1200)); then
      printf '\n' >&2
      log "Timed out after 20 minutes waiting for $what. Run this script again later: it will reuse it."
      exit 1
    fi
    printf '\r  waiting for %s... %ds ' "$what" $((SECONDS - start)) >&2
    sleep "${POLL_SECONDS:-5}"
  done
}

log "Project $PROJECT, location $LOCATION"
log "Enabling the Agent Platform API..."
gcloud services enable aiplatform.googleapis.com --project "$PROJECT" >&2

ENGINE=$(api GET "$PARENT/reasoningEngines?pageSize=100" |
  jq -r --arg name "$NAME" '[.reasoningEngines // [] | .[] | select(.displayName == $name)] | sort_by(.createTime) | last | .name // empty')
if [[ -n $ENGINE ]]; then
  log "Reusing the engine $ENGINE"
else
  log "Creating the engine (Memory Bank). This usually takes 2-5 minutes."
  publisher="$PARENT/publishers/google/models"
  body=$(jq -n --arg name "$NAME" --arg model "$publisher/$MODEL" --arg embedding "$publisher/gemini-embedding-001" \
    '{displayName: $name, contextSpec: {memoryBankConfig: {generationConfig: {model: $model}, similaritySearchConfig: {embeddingModel: $embedding}}}}')
  op=$(api POST "$PARENT/reasoningEngines" "$body" | jq -r .name)
  ENGINE=$(wait_for "$op" "the engine")
  log "Created $ENGINE"
fi

# A sandbox template by display name: reused if it exists, created otherwise.
template() {
  local name=$1 category=$2 existing body op
  existing=$(api GET "$ENGINE/sandboxEnvironmentTemplates?pageSize=100" |
    jq -r --arg name "$name" '[.sandboxEnvironmentTemplates // [] | .[] | select(.displayName == $name)] | last | .name // empty')
  if [[ -n $existing ]]; then
    log "Reusing the $name sandbox template"
    printf '%s' "$existing"
    return
  fi
  log "Creating the $name sandbox template..."
  body=$(jq -n --arg name "$name" --arg category "$category" \
    '{displayName: $name, defaultContainerEnvironment: {defaultContainerCategory: $category}, egressControlConfig: {internetAccess: true}}')
  op=$(api POST "$ENGINE/sandboxEnvironmentTemplates" "$body" | jq -r .name)
  wait_for "$op" "the $name template"
}

SHELL_TEMPLATE=$(template shell DEFAULT_CONTAINER_CATEGORY_SHELL_SANDBOX)
BROWSER_TEMPLATE=$(template browser DEFAULT_CONTAINER_CATEGORY_COMPUTER_USE)

log "Done."
cat <<EOF
NUXT_GCP_PROJECT=$PROJECT
NUXT_GCP_LOCATION=$LOCATION
NUXT_GCP_ENGINE=$ENGINE
NUXT_GCP_SHELL_TEMPLATE=$SHELL_TEMPLATE
NUXT_GCP_BROWSER_TEMPLATE=$BROWSER_TEMPLATE
EOF
