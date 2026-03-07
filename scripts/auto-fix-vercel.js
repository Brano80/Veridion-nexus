#!/usr/bin/env node
/**
 * Automatically fix Vercel root directory using stored CLI credentials.
 * This script reads the Vercel token from the CLI's config directory.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ROOT_DIR = 'veridion-landing';
const VERCEL_API = 'api.vercel.com';

function getVercelToken() {
  // Try to read from Vercel CLI config
  const homeDir = os.homedir();
  const configPaths = [
    path.join(homeDir, '.vercel', 'auth.json'), // Windows/Linux/Mac
    path.join(homeDir, 'Library', 'Application Support', 'vercel', 'auth.json'), // Mac alternative
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const auth = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Vercel stores token in different formats, try common ones
        if (auth.token) return auth.token;
        if (auth.tokens && auth.tokens.length > 0) return auth.tokens[0].token;
      } catch (e) {
        // Continue to next path
      }
    }
  }

  // Fall back to environment variable
  return process.env.VERCEL_TOKEN;
}

function getConfig() {
  const token = getVercelToken();
  if (!token) {
    console.error('❌ Vercel token not found.');
    console.error('');
    console.error('Please set VERCEL_TOKEN environment variable:');
    console.error('  PowerShell: $env:VERCEL_TOKEN = "your_token"');
    console.error('  Bash: export VERCEL_TOKEN="your_token"');
    console.error('');
    console.error('Or get a token from: https://vercel.com/account/tokens');
    process.exit(1);
  }

  // Read project config from .vercel/project.json
  const projectPath = path.join(process.cwd(), 'veridion-landing', '.vercel', 'project.json');
  if (!fs.existsSync(projectPath)) {
    console.error('❌ Project not linked. Run: cd veridion-landing && vercel link');
    process.exit(1);
  }

  const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const projectId = projectData.projectId;
  const teamId = projectData.orgId;

  if (!projectId) {
    console.error('❌ Project ID not found in .vercel/project.json');
    process.exit(1);
  }

  return { token, projectId, teamId };
}

function patchProject(token, projectId, teamId) {
  const body = JSON.stringify({ rootDirectory: ROOT_DIR });
  const url = `/v9/projects/${encodeURIComponent(projectId)}?teamId=${encodeURIComponent(teamId)}`;
  
  const options = {
    hostname: VERCEL_API,
    path: url,
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const errorMsg = json.error?.message || json.message || data || `HTTP ${res.statusCode}`;
            reject(new Error(errorMsg));
          }
        } catch (e) {
          reject(new Error(data || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔧 Fixing Vercel root directory...\n');
  
  const { token, projectId, teamId } = getConfig();
  console.log(`📦 Project: ${projectId}`);
  console.log(`📁 Setting Root Directory to "${ROOT_DIR}"...\n`);
  
  try {
    await patchProject(token, projectId, teamId);
    console.log('✅ Success! Root Directory is now set to "veridion-landing"\n');
    console.log('🚀 Next steps:');
    console.log('   1. Ensure GitHub is connected in Vercel dashboard');
    console.log('   2. Go to: https://vercel.com/dashboard');
    console.log('   3. Select "veridion-landing" project');
    console.log('   4. Settings → Git → Verify repository is connected');
    console.log('   5. Settings → Build and Deployment → Verify "Root Directory" shows "veridion-landing"');
    console.log('\n✨ Every git push will now automatically deploy!\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\n💡 Alternative: Set manually in dashboard:');
    console.error('   https://vercel.com/dashboard → veridion-landing → Settings → Build and Deployment');
    console.error('   Set "Root Directory" to: veridion-landing\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
