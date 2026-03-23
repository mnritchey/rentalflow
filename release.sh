#!/usr/bin/env bash
# release.sh — tag a new version, push the tag, and let GitHub Actions do the rest
#
# Usage:
#   ./release.sh 1.2.3          → creates tag v1.2.3 and pushes it
#   ./release.sh patch          → bumps the patch version (e.g. 1.0.0 → 1.0.1)
#   ./release.sh minor          → bumps the minor version (e.g. 1.0.1 → 1.1.0)
#   ./release.sh major          → bumps the major version (e.g. 1.1.0 → 2.0.0)

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────
latest_tag() {
  git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n1
}

bump() {
  local current="$1" part="$2"
  IFS='.' read -r major minor patch <<< "${current#v}"
  case "$part" in
    major) echo "v$((major+1)).0.0" ;;
    minor) echo "v${major}.$((minor+1)).0" ;;
    patch) echo "v${major}.${minor}.$((patch+1))" ;;
  esac
}

# ── Determine new tag ─────────────────────────────────────────────────────────
INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <version|patch|minor|major>"
  exit 1
fi

CURRENT=$(latest_tag || echo "v0.0.0")

case "$INPUT" in
  patch|minor|major)
    NEW_TAG=$(bump "$CURRENT" "$INPUT")
    ;;
  v*.*.*)
    NEW_TAG="$INPUT"
    ;;
  *.*.*)
    NEW_TAG="v$INPUT"
    ;;
  *)
    echo "❌  Invalid input: $INPUT"
    echo "    Provide a version (1.2.3 or v1.2.3) or bump keyword (patch|minor|major)"
    exit 1
    ;;
esac

echo "Current tag : ${CURRENT:-none}"
echo "New tag     : $NEW_TAG"
echo ""

# ── Confirm ───────────────────────────────────────────────────────────────────
read -r -p "Create and push tag $NEW_TAG? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Tag and push ──────────────────────────────────────────────────────────────
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
git push origin "$NEW_TAG"

echo ""
echo "✅  Tag $NEW_TAG pushed — GitHub Actions will build and push the Docker image."
echo "    Watch progress at: $(git remote get-url origin | sed 's/\.git$//')/actions"
