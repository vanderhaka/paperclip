#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PAPERCLIP_VPS_HOST:-}" ]]; then
  echo "PAPERCLIP_VPS_HOST is required." >&2
  exit 1
fi

PAPERCLIP_VPS_USER="${PAPERCLIP_VPS_USER:-root}"
PAPERCLIP_VPS_SSH_PORT="${PAPERCLIP_VPS_SSH_PORT:-${PAPERCLIP_VPS_PORT:-22}}"
PAPERCLIP_VPS_COMPOSE_DIR="${PAPERCLIP_VPS_COMPOSE_DIR:-/docker/paperclip-4zrs}"
PAPERCLIP_DEPLOY_SERVICE="${PAPERCLIP_DEPLOY_SERVICE:-paperclip}"
PAPERCLIP_DEPLOY_REF="${PAPERCLIP_DEPLOY_REF:-${GITHUB_SHA:-HEAD}}"
PAPERCLIP_DEPLOY_MIN_FREE_GB="${PAPERCLIP_DEPLOY_MIN_FREE_GB:-20}"
PAPERCLIP_DEPLOY_PREFLIGHT_ONLY="${PAPERCLIP_DEPLOY_PREFLIGHT_ONLY:-0}"

git rev-parse --verify "${PAPERCLIP_DEPLOY_REF}^{commit}" >/dev/null
PAPERCLIP_DEPLOY_SHA="${PAPERCLIP_DEPLOY_SHA:-$(git rev-parse --short=12 "${PAPERCLIP_DEPLOY_REF}^{commit}")}"
PAPERCLIP_DEPLOY_IMAGE="${PAPERCLIP_DEPLOY_IMAGE:-paperclip-custom:fork-${PAPERCLIP_DEPLOY_SHA}}"

REMOTE="${PAPERCLIP_VPS_USER}@${PAPERCLIP_VPS_HOST}"
SSH_OPTS=(
  -p "${PAPERCLIP_VPS_SSH_PORT}"
  -o BatchMode=yes
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
  -o StrictHostKeyChecking=accept-new
)

if [[ -n "${PAPERCLIP_VPS_SSH_KEY_PATH:-}" ]]; then
  if [[ ! -f "${PAPERCLIP_VPS_SSH_KEY_PATH}" ]]; then
    echo "PAPERCLIP_VPS_SSH_KEY_PATH does not exist: ${PAPERCLIP_VPS_SSH_KEY_PATH}" >&2
    exit 1
  fi
  SSH_OPTS+=(-i "${PAPERCLIP_VPS_SSH_KEY_PATH}")
fi

shell_quote() {
  printf "%q" "$1"
}

echo "Preflighting ${REMOTE}:${PAPERCLIP_VPS_COMPOSE_DIR}..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "bash -s -- $(shell_quote "${PAPERCLIP_VPS_COMPOSE_DIR}") $(shell_quote "${PAPERCLIP_DEPLOY_SERVICE}") $(shell_quote "${PAPERCLIP_DEPLOY_MIN_FREE_GB}")" <<'REMOTE_PREFLIGHT'
set -euo pipefail
compose_dir="$1"
service="$2"
min_free_gb="$3"

cd "$compose_dir"
test -f docker-compose.yml
test -d data
docker compose config --services | grep -Fx "$service" >/dev/null

if ! [[ "$min_free_gb" =~ ^[0-9]+$ ]]; then
  echo "PAPERCLIP_DEPLOY_MIN_FREE_GB must be a whole number, got: ${min_free_gb}" >&2
  exit 1
fi

available_kb="$(df -Pk / | awk 'NR == 2 { print $4 }')"
required_kb="$((min_free_gb * 1024 * 1024))"
available_gb="$((available_kb / 1024 / 1024))"

echo "Disk preflight: ${available_gb}GB free on /; require at least ${min_free_gb}GB."
docker system df || true

if (( available_kb < required_kb )); then
  cat >&2 <<EOF
Not enough free disk space for a VPS deploy.

Free on /: ${available_gb}GB
Required:  ${min_free_gb}GB

Safe cleanup candidates are usually Docker build cache and unused old images.
Do not delete or replace ${compose_dir}/data; it is the hosted Paperclip runtime data.
EOF
  exit 1
fi
REMOTE_PREFLIGHT

if [[ "${PAPERCLIP_DEPLOY_PREFLIGHT_ONLY}" == "1" ]]; then
  echo "Preflight-only mode complete."
  exit 0
fi

echo "Building ${PAPERCLIP_DEPLOY_IMAGE} from ${PAPERCLIP_DEPLOY_REF} on ${PAPERCLIP_VPS_HOST}..."
COPYFILE_DISABLE=1 git archive --format=tar "${PAPERCLIP_DEPLOY_REF}" | ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "cd $(shell_quote "${PAPERCLIP_VPS_COMPOSE_DIR}") && docker build --pull=false -t $(shell_quote "${PAPERCLIP_DEPLOY_IMAGE}") -"

echo "Deploying ${PAPERCLIP_DEPLOY_IMAGE}..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "PAPERCLIP_DEPLOY_IMAGE=$(shell_quote "${PAPERCLIP_DEPLOY_IMAGE}") bash -s -- $(shell_quote "${PAPERCLIP_VPS_COMPOSE_DIR}") $(shell_quote "${PAPERCLIP_DEPLOY_SERVICE}")" <<'REMOTE_DEPLOY'
set -euo pipefail
compose_dir="$1"
service="$2"
image="${PAPERCLIP_DEPLOY_IMAGE:?}"

cd "$compose_dir"
backup="docker-compose.yml.pre-deploy-$(date +%Y%m%d%H%M%S)"
cp docker-compose.yml "$backup"

previous_image="$(
  SERVICE="$service" IMAGE="$image" python3 - <<'PY'
from pathlib import Path
import os
import sys

service = os.environ["SERVICE"]
image = os.environ["IMAGE"]
path = Path("docker-compose.yml")
lines = path.read_text().splitlines(keepends=True)
in_services = False
in_target = False
service_indent = None
image_index = None

for index, line in enumerate(lines):
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue

    indent = len(line) - len(line.lstrip(" "))
    if stripped == "services:":
        in_services = True
        continue

    if not in_services:
        continue

    if indent == 0 and stripped.endswith(":"):
        break

    if stripped == f"{service}:":
        in_target = True
        service_indent = indent
        continue

    if in_target:
        if indent <= service_indent and stripped.endswith(":"):
            break
        if stripped.startswith("image:"):
            image_index = index
            break

if image_index is None:
    print(f"Could not find image line for service {service!r}", file=sys.stderr)
    sys.exit(1)

prefix, old_image = lines[image_index].split("image:", 1)
old_image = old_image.strip()
line_ending = "\n" if lines[image_index].endswith("\n") else ""
lines[image_index] = f"{prefix}image: {image}{line_ending}"
path.write_text("".join(lines))
print(old_image)
PY
)"

rollback() {
  status=$?
  trap - ERR
  set +e
  echo "Deploy failed; rolling back to ${previous_image} with ${backup}." >&2
  cp "$backup" docker-compose.yml
  docker compose up -d "$service" >&2
  exit "$status"
}
trap rollback ERR

echo "Updated docker-compose.yml: ${previous_image} -> ${image}"
docker compose up -d "$service"

public_port="$(grep -E '^PUBLIC_PORT=' .env 2>/dev/null | head -n 1 | cut -d= -f2- || true)"
public_port="${PAPERCLIP_DEPLOY_HEALTH_PORT:-${public_port:-3100}}"
health_url="http://127.0.0.1:${public_port}/api/health"

for _ in $(seq 1 30); do
  if curl -fsS "$health_url" > /tmp/paperclip-health.json; then
    break
  fi
  sleep 2
done

if [[ ! -s /tmp/paperclip-health.json ]]; then
  echo "Health check failed at ${health_url}" >&2
  docker compose ps >&2
  exit 1
fi

container_id="$(docker compose ps -q "$service" | head -n 1)"
running_image="$(docker inspect -f '{{.Config.Image}}' "$container_id")"
if [[ "$running_image" != "$image" ]]; then
  echo "Container is running ${running_image}, expected ${image}" >&2
  exit 1
fi

trap - ERR
docker compose ps --format "table {{.Name}}\t{{.Service}}\t{{.State}}\t{{.Status}}\t{{.Image}}"
echo "Health: $(cat /tmp/paperclip-health.json)"
REMOTE_DEPLOY
