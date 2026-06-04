#!/usr/bin/env bash
# agent-doctor pre-commit hook
# Runs structural analysis on staged agent instruction files.
# Install: bash scripts/install-hook.sh
# Or manually: cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -euo pipefail

AGENT_FILES=(
  "CLAUDE.md" "AGENTS.md" "GEMINI.md"
  ".github/copilot-instructions.md"
  ".windsurfrules" ".cursorrules"
)

staged=()

for f in "${AGENT_FILES[@]}"; do
  if git diff --cached --name-only | grep -qF "$f"; then
    staged+=("$f")
  fi
done

# Also catch staged .mdc and .roo/rules/*.md files
while IFS= read -r f; do
  [[ "$f" == *.mdc ]] && staged+=("$f")
  [[ "$f" == .roo/rules/*.md ]] && staged+=("$f")
done < <(git diff --cached --name-only)

if [ ${#staged[@]} -eq 0 ]; then
  exit 0
fi

echo "agent-doctor: checking ${#staged[@]} staged file(s)…"

if ! command -v npx &>/dev/null; then
  echo "agent-doctor: npx not found — skipping hook" >&2
  exit 0
fi

failed=0
for f in "${staged[@]}"; do
  if [ -f "$f" ]; then
    if ! npx --yes @chiragdarji/agent-doctor "$f" --structural-only --fail-on critical --format text; then
      failed=1
    fi
  fi
done

if [ $failed -ne 0 ]; then
  echo ""
  echo "agent-doctor: critical issues found — commit blocked."
  echo "Run with --fix to auto-repair, or use git commit --no-verify to bypass."
  exit 1
fi
