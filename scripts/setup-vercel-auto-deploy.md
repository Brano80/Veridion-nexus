# Set Up Automatic Vercel Deployment

This guide will help you configure automatic deployments so every `git push` automatically deploys to Vercel.

## Quick Fix (5 minutes)

### Step 1: Set Root Directory via API

Run this command (you'll need a Vercel token):

```powershell
# Get your token from: https://vercel.com/account/tokens
$env:VERCEL_TOKEN = "your_token_here"
node scripts/set-vercel-root.js
```

Or use the auto-detection script:
```powershell
$env:VERCEL_TOKEN = "your_token_here"
node scripts/auto-fix-vercel.js
```

### Step 2: Verify GitHub Integration

1. Go to https://vercel.com/dashboard
2. Select **veridion-landing** project
3. Go to **Settings → Git**
4. Ensure your GitHub repository is connected
5. If not connected, click **"Connect Git Repository"** and select your repo
6. Make sure **"Production Branch"** is set to `main`
7. Enable **"Automatic deployments from Git"**

### Step 3: Test It

Make a small change and push:
```bash
git add .
git commit -m "Test automatic deployment"
git push
```

Check https://vercel.com/dashboard → veridion-landing → Deployments to see the automatic deployment.

## Alternative: GitHub Actions (Backup Method)

If Vercel's Git integration doesn't work, you can use GitHub Actions:

1. Go to your GitHub repository → **Settings → Secrets and variables → Actions**
2. Add these secrets:
   - `VERCEL_TOKEN` - Get from https://vercel.com/account/tokens
   - `VERCEL_ORG_ID` - From `.vercel/project.json` (currently: `team_NkGKOkJkMcQVEdJQEL4COIgN`)
   - `VERCEL_PROJECT_ID` - From `.vercel/project.json` (currently: `prj_v7M9XLrJE5R3moE7mBl276rhhWKC`)

3. The workflow in `.github/workflows/vercel-deploy.yml` will automatically deploy on every push to `main`

## Troubleshooting

### "Root Directory" keeps resetting

This happens if the setting isn't saved properly. Fix:
1. Go to Vercel dashboard → Settings → Build and Deployment
2. Set "Root Directory" to `veridion-landing`
3. Click **Save**
4. Make a test commit and push

### Deployments fail with "Configuration Settings differ"

This means the root directory in the dashboard doesn't match what's deployed. Fix:
1. Go to Settings → Build and Deployment
2. Check "Root Directory" - should be `veridion-landing`
3. Check "Production Overrides" section - should match or be empty
4. Save and redeploy

### GitHub not connected

If you see "No Git repository connected":
1. Go to Settings → Git
2. Click "Connect Git Repository"
3. Authorize Vercel to access your GitHub account
4. Select the repository
5. Save

## Current Configuration

- **Project**: veridion-landing
- **Root Directory**: `veridion-landing` (should be set)
- **Build Command**: `npm run build`
- **Output**: `.next`
- **Framework**: Next.js

## After Setup

✅ Every push to `main` triggers automatic deployment
✅ You can see deployment status in Vercel dashboard
✅ Build logs are available for debugging
✅ No manual `vercel --prod` needed!
