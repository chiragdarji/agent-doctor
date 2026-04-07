#!/usr/bin/env bash
# v0.3 release script for agent-doctor
# Run this from the project root

set -e

echo "🩺 agent-doctor v0.3 release checklist"
echo "======================================="

# 1. Check npm login
echo ""
echo "Step 1: Checking npm auth..."
npm whoami || (echo "❌ Not logged in. Run: npm login" && exit 1)
echo "✅ Logged in as: $(npm whoami)"

# 2. Check package name
echo ""
echo "Step 2: Checking package config..."
PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_VERSION=$(node -p "require('./package.json').version")
echo "  Name:    $PACKAGE_NAME"
echo "  Version: $PACKAGE_VERSION"

if [[ "$PACKAGE_NAME" != "@chiragdarji/agent-doctor" ]]; then
  echo "❌ Package name mismatch. Expected @chiragdarji/agent-doctor"
  exit 1
fi
echo "✅ Package config OK"

# 3. Build
echo ""
echo "Step 3: Building..."
npm run build
echo "✅ Build complete"

# 4. Typecheck
echo ""
echo "Step 4: Typechecking..."
npm run typecheck
echo "✅ No type errors"

# 5. Tests
echo ""
echo "Step 5: Running tests..."
npm run test:run
echo "✅ All tests pass"

# 6. Dry run
echo ""
echo "Step 6: Dry run publish..."
npm publish --dry-run --access public
echo "✅ Dry run OK"

# 7. Confirm
echo ""
echo "======================================="
echo "Ready to publish $PACKAGE_NAME@$PACKAGE_VERSION"
echo ""
read -p "Publish now? (y/N) " confirm

if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  npm publish --access public
  echo ""
  echo "✅ Published! Verify at:"
  echo "   https://www.npmjs.com/package/$PACKAGE_NAME"
  echo ""
  echo "Test with:"
  echo "   npx $PACKAGE_NAME --version"
  echo "   npx $PACKAGE_NAME --help"
  echo "   npx $PACKAGE_NAME --structural-only CLAUDE.md"
else
  echo "Aborted."
fi
