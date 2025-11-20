#!/bin/bash

# Deploy script for awpaki npm package
# This script builds the TypeScript code and publishes to npm

set -e  # Exit on error

echo "🚀 Starting deployment process for awpaki..."

# Step 1: Clean previous build
echo "📦 Cleaning previous build..."
rm -rf dist

# Step 2: Run tests
echo "🧪 Running tests..."
npm test

# Step 3: Build the project
echo "🔨 Building TypeScript project..."
npm run build

# Step 4: Check if dist directory was created
if [ ! -d "dist" ]; then
  echo "❌ Error: Build failed - dist directory not found"
  exit 1
fi

echo "✅ Build completed successfully"

# Step 5: Verify package.json exists
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found"
  exit 1
fi

# Step 6: Show what will be published
echo "📋 Files to be published:"
npm pack --dry-run

# Step 7: Confirm before publishing
echo ""
echo "⚠️  Ready to publish to npm"
echo "Press Ctrl+C to cancel or Enter to continue..."
read -r

# Step 8: Publish to npm
echo "📤 Publishing to npm..."
npm publish

echo "✨ Deployment completed successfully!"
echo "🎉 Package published to npm"
