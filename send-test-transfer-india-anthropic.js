// Send 5 transfers to India for partner Anthropic, one after another (burst grouping test)
const https = require('https');
const http = require('http');

const API_URL = process.env.VERIDION_NEXUS_API_URL || process.argv[2] || 'https://api.veridion-nexus.eu';
const API_KEY = process.env.VERIDION_NEXUS_API_KEY || process.argv[3];

if (!API_KEY) {
  console.error('❌ Error: API key required');
  console.error('Usage: node send-test-transfer-india-anthropic.js [API_URL] [API_KEY]');
  console.error('Or set VERIDION_NEXUS_API_URL and VERIDION_NEXUS_API_KEY');
  process.exit(1);
}

const transferData = {
  destinationCountryCode: 'IN',
  destinationCountry: 'India',
  dataCategories: ['email', 'name'],
  partnerName: 'Anthropic',
  protocol: 'HTTPS',
  requestPath: '/api/test',
  sourceIp: '192.168.1.100',
  destIp: '203.0.113.50',
  dataSize: 1024,
  userAgent: 'Test-Client/1.0'
};

function sendTransfer(n) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}/api/v1/shield/evaluate`);
    const postData = JSON.stringify(transferData);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch {
            reject(new Error('Parse error: ' + data));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('🚀 Sending 5 transfers to India for Anthropic (email, name)...');
  console.log('📤 Endpoint:', `${API_URL}/api/v1/shield/evaluate`);
  console.log('');

  for (let i = 1; i <= 5; i++) {
    try {
      const result = await sendTransfer(i);
      console.log(`  ${i}/5 ✅ Decision: ${result.decision} | Review ID: ${result.review_id || 'N/A'}`);
    } catch (e) {
      console.error(`  ${i}/5 ❌ ${e.message}`);
    }
  }

  console.log('');
  console.log('✅ Done. Check the Review Queue — should show 1 grouped entry with ×5 transfers badge.');
}

main().catch(console.error);
