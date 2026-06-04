#!/usr/bin/env bash
# Installs the agent-doctor pre-commit hook into .git/hooks/
set -euo pipefail

HOOK_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$HOOK_FILE" ]; then
  echo "Pre-commit hook already exists at $HOOK_FILE"
  echo "Add this to it manually or use --force to overwrite:"
  echo "  bash scripts/install-hook.sh --force"
  if [ "${1:-}" != "--force" ]; then
    exit 1
  fi
fi

cp "$SCRIPT_DIR/pre-commit.sh" "$HOOK_FILE"
chmod +x "$HOOK_FILE"
echo "✓ agent-doctor pre-commit hook installed at $HOOK_FILE"
