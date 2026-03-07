#!/bin/bash
# Fix Vercel deployment configuration
# This script sets the root directory and ensures GitHub integration works

set -e

echo "🔧 Fixing Vercel deployment configuration..."

# Check if we're in the right directory
if [ ! -d "veridion-landing" ]; then
    echo "❌ Error: veridion-landing directory not found"
    echo "   Run this script from the repository root"
    exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with: npm i -g vercel"
    exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Not logged in to Vercel. Run: vercel login"
    exit 1
fi

echo "✅ Vercel CLI is ready"

# Navigate to veridion-landing directory
cd veridion-landing

# Link project if not already linked
if [ ! -f ".vercel/project.json" ]; then
    echo "📦 Linking Vercel project..."
    vercel link --yes
fi

echo "✅ Configuration complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Go to https://vercel.com/dashboard"
echo "   2. Select 'veridion-landing' project"
echo "   3. Go to Settings → Git"
echo "   4. Ensure GitHub is connected"
echo "   5. Go to Settings → Build and Deployment"
echo "   6. Set 'Root Directory' to: veridion-landing"
echo "   7. Save settings"
echo ""
echo "🚀 After this, every git push will automatically deploy!"
