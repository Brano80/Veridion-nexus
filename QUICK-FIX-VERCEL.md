# � Quick Fix for Vercel Automatic Deployment

## The Problem
Vercel deployments fail because the **Root Directory** isn't set to `veridion-landing`.

## The Solution (Choose One)

### ✅ Option 1: Use API Script (Fastest - 2 minutes)

1. **Get your Vercel token:**
   - Go to: https://vercel.com/account/tokens
   - Click "Create Token"
   - Copy the token

2. **Run the fix script:**
   ```powershell
   $env:VERCEL_TOKEN = "paste_your_token_here"
   node scripts/set-vercel-root.js
   ```

3. **Verify GitHub is connected:**
   - Go to: https://vercel.com/dashboard → veridion-landing → Settings → Git
   - Make sure your repository is connected
   - Enable "Automatic deployments from Git"

**Done!** Every `git push` will now automatically deploy.

---

### ✅ Option 2: Manual Dashboard Fix (5 minutes)

1. Go to: https://vercel.com/dashboard
2. Select **veridion-landing** project
3. Go to **Settings → Build and Deployment**
4. Find **"Root Directory"** field
5. Set it to: `veridion-landing`
6. Click **Save**
7. Go to **Settings → Git**
8. Ensure GitHub repository is connected
9. Enable "Automatic deployments from Git"

**Done!** Every `git push` will now automatically deploy.

---

## Test It

After fixing, test with:
```bash
git add .
git commit -m "Test auto deployment"
git push
```

Then check: https://vercel.com/dashboard → veridion-landing → Deployments

You should see a new deployment starting automatically!

---

## Why This Happens

Vercel needs to know that your Next.js app is in the `veridion-landing` subdirectory, not at the repository root. Without this setting, it tries to build from the wrong location and fails.

---

## Need Help?

See detailed guide: `scripts/setup-vercel-auto-deploy.md`
