# Automatic Vercel Deployment Setup

This guide will help you set up automatic deployments to Vercel whenever you push changes to GitHub.

## Problem
Vercel deployments are failing because the root directory is not configured correctly. The project is in the `veridion-landing` subdirectory, but Vercel is trying to build from the repository root.

## Solution

### Option 1: Use the API Script (Recommended)

1. **Get your Vercel token:**
   - Go to https://vercel.com/account/tokens
   - Create a new token (or use an existing one)
   - Copy the token

2. **Run the script:**
   ```powershell
   $env:VERCEL_TOKEN = "your_token_here"
   node scripts/set-vercel-root.js
   ```

   Or on Linux/Mac:
   ```bash
   export VERCEL_TOKEN="your_token_here"
   node scripts/set-vercel-root.js
   ```

This will automatically set the root directory to `veridion-landing` via the Vercel API.

### Option 2: Manual Configuration in Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select the `veridion-landing` project
3. Go to **Settings → Build and Deployment**
4. Find **"Root Directory"** field
5. Set it to: `veridion-landing`
6. Click **Save**

### Option 3: Verify GitHub Integration

1. Go to **Settings → Git** in your Vercel project
2. Ensure your GitHub repository is connected
3. Make sure **"Production Branch"** is set to `main`
4. Enable **"Automatic deployments from Git"**

## After Setup

Once the root directory is configured:

✅ Every `git push` to `main` will automatically trigger a Vercel deployment
✅ You can see deployment status in the Vercel dashboard
✅ Build logs will show if there are any issues

## Troubleshooting

If deployments still fail:

1. Check the deployment logs in Vercel dashboard
2. Verify `veridion-landing/vercel.json` exists and is correct
3. Ensure `veridion-landing/package.json` has the correct build script
4. Make sure all dependencies are in `package.json` (not just devDependencies)

## Current Configuration

- **Project ID**: `prj_v7M9XLrJE5R3moE7mBl276rhhWKC`
- **Root Directory**: Should be `veridion-landing`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Framework**: Next.js (auto-detected)
