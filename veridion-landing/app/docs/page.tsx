'use client';

import { useState, useEffect, useRef } from 'react';
import { Shield, Menu, X, Copy, Check } from 'lucide-react';
import Link from 'next/link';

const sections = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'integration-patterns', label: 'Integration Patterns' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'agent-registration', label: 'Agent Registration' },
  { id: 'evaluate-transfer', label: 'Evaluate Transfer' },
  { id: 'response-reference', label: 'Response Reference' },
  { id: 'error-codes', label: 'Error Codes' },
  { id: 'shadow-mode', label: 'Shadow Mode' },
  { id: 'code-examples', label: 'Code Examples' },
  { id: 'mcp-server', label: 'MCP Server' },
  { id: 'limitations', label: 'Limitations' },
];

export default function DocsPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('quick-start');
  const [codeTab, setCodeTab] = useState<'curl' | 'python' | 'nodejs'>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach((section) => {
      const element = sectionRefs.current[section.id];
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function scrollToSection(id: string) {
    const element = sectionRefs.current[id];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileMenuOpen(false);
    }
  }

  const CodeBlock = ({ code, language, id }: { code: string; language: string; id: string }) => (
    <div className="relative group">
      <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy code"
      >
        {copiedId === id ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a] border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
                <span className="text-xl font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
                <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
              </h1>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/docs" className="text-slate-300 hover:text-white transition-colors text-sm">
                Documentation
              </Link>
              <Link href="/spec" className="text-slate-300 hover:text-white transition-colors text-sm">
                Spec
              </Link>
              <a 
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-white transition-colors text-sm"
              >
                Sign In
              </a>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-800 py-4 space-y-3">
              <Link href="/docs" className="block text-slate-300 hover:text-white transition-colors text-sm">
                Documentation
              </Link>
              <Link href="/spec" className="block text-slate-300 hover:text-white transition-colors text-sm" onClick={() => setMobileMenuOpen(false)}>
                Spec
              </Link>
              <a 
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-300 hover:text-white transition-colors text-sm"
              >
                Sign In
              </a>
            </div>
          )}
        </div>
      </nav>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="hidden lg:block w-64 bg-slate-50 border-r border-slate-200 h-screen sticky top-16 overflow-y-auto">
          <div className="p-6">
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-emerald-100 text-emerald-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile Sidebar Dropdown */}
        <div className="lg:hidden w-full">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
            <select
              value={activeSection}
              onChange={(e) => scrollToSection(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 bg-[#f8fafc] min-h-screen">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            
            {/* Quick Start */}
            <section
              id="quick-start"
              ref={(el) => { sectionRefs.current['quick-start'] = el; }}
              className="mb-16"
            >
              <h1 className="text-4xl font-bold text-slate-900 mb-4">Quick Start</h1>
              <h2 className="text-2xl font-semibold text-slate-800 mb-6">Integrate in under 30 minutes</h2>

              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Step 1 — Get your API key</h3>
                  <p className="text-slate-700 mb-4">
                    <Link href="/signup" className="text-emerald-600 hover:text-emerald-700 underline">Sign up</Link> at veridion-nexus.eu. Your API key is displayed once on the success screen and emailed to you. It starts with <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">ss_test_</code>
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Step 2 — Make your first evaluation</h3>
                  <CodeBlock
                    id="quick-start-curl"
                    language="bash"
                    code={`curl -X POST https://api.veridion-nexus.eu/api/v1/shield/evaluate \\
  -H "Authorization: Bearer ss_test_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destination_country_code": "US",
    "data_categories": ["email", "name"],
    "partner_name": "OpenAI",
    "agent_id": "agt_your_agent_id",
    "agent_api_key": "agt_key_your_agent_api_key"
  }'`}
                  />
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Step 3 — Handle the decision</h3>
                  <CodeBlock
                    id="quick-start-js"
                    language="javascript"
                    code={`const { decision, reason, legal_basis } = response;

if (decision === 'BLOCK') {
  throw new Error(\`Transfer blocked: \${reason}\`);
}
if (decision === 'REVIEW') {
  await queueForHumanReview(transferId);
  return; // do not proceed
}
// decision === 'ALLOW' — proceed with transfer`}
                  />
                </div>
              </div>
            </section>

            {/* Integration Patterns */}
            <section
              id="integration-patterns"
              ref={(el) => { sectionRefs.current['integration-patterns'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Integration Patterns</h2>
              
              <h3 className="text-xl font-semibold text-slate-800 mb-4">Where does evaluate() fit?</h3>
              <p className="text-slate-700 mb-6">
                Veridion Nexus works at your application's outbound layer — the point where your code calls an external API. You don't need to add it to every line of code. Add it once, to the wrapper function that calls your AI provider.
              </p>

              {/* Flow Diagram */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8">
                <div className="space-y-2 text-sm font-mono text-slate-700 text-center">
                  <div>Your Application</div>
                  <div className="text-slate-400">↓</div>
                  <div>Middleware / Wrapper Function</div>
                  <div className="text-slate-400">↓ evaluate_transfer()</div>
                  <div className="flex items-center justify-center gap-4">
                    <span>Veridion Nexus</span>
                    <span className="text-slate-400">←→</span>
                    <span>Evidence Vault</span>
                  </div>
                  <div className="text-slate-400">↓ ALLOW / BLOCK / REVIEW</div>
                  <div>OpenAI / Anthropic / AWS</div>
                  <div className="text-slate-400">↓</div>
                  <div>Response</div>
                </div>
              </div>

              {/* How to set destination_country_code */}
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded-r-lg">
                <h4 className="text-lg font-semibold text-slate-900 mb-2">How to set destination_country_code</h4>
                <p className="text-slate-700 text-sm">
                  This field is not auto-detected — you set it once per vendor integration based on where that vendor processes data. Example: OpenAI → "US", AWS Frankfurt → "DE", Anthropic → "US". You define it as a constant in your wrapper function, not dynamically per call.
                </p>
              </div>

              {/* Pattern Cards */}
              <div className="space-y-6">
                {/* Pattern 1 */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Pattern 1 — Direct wrapper (simplest)</h4>
                  <p className="text-slate-700 mb-4 text-sm">
                    Wrap your AI provider call. One function, one evaluate() call.
                  </p>
                  <CodeBlock
                    id="pattern-1"
                    language="python"
                    code={`def call_openai(messages, user_data):
    # Evaluate before every external AI call
    shield = evaluate_transfer(
        agent_id="agt_your_agent_id",
        agent_api_key="agt_key_your_agent_api_key",
        destination_country_code="US",
        data_categories=["email", "name"],
        partner_name="OpenAI"
    )
    if shield["decision"] == "BLOCK":
        raise Exception("Transfer blocked")
    if shield["decision"] == "REVIEW":
        queue_for_review(shield["seal_id"])
        return None
    
    return openai.chat.completions.create(
        messages=messages
    )`}
                  />
                </div>

                {/* Pattern 2 */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Pattern 2 — LangChain middleware</h4>
                  <p className="text-slate-700 mb-4 text-sm">
                    Add as a LangChain callback or middleware. Evaluates automatically before every LLM call.
                  </p>
                  <CodeBlock
                    id="pattern-2"
                    language="python"
                    code={`from langchain_core.callbacks import BaseCallbackHandler

class SovereignShieldCallback(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        result = evaluate_transfer(
            agent_id="agt_your_agent_id",
            agent_api_key="agt_key_your_agent_api_key",
            destination_country_code="US",
            data_categories=["email"],
            partner_name="OpenAI"
        )
        if result["decision"] == "BLOCK":
            raise BlockedTransferError(result["reason"])

# Add to your LLM
llm = ChatOpenAI(callbacks=[SovereignShieldCallback()])`}
                  />
                </div>

                {/* Pattern 3 */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Pattern 3 — Express middleware (Node.js)</h4>
                  <p className="text-slate-700 mb-4 text-sm">
                    Add as Express middleware to evaluate all outbound requests automatically.
                  </p>
                  <CodeBlock
                    id="pattern-3"
                    language="javascript"
                    code={`const shieldMiddleware = async (req, res, next) => {
    const result = await shield.evaluate({
        agentId: 'agt_your_agent_id',
        agentApiKey: 'agt_key_your_agent_api_key',
        destinationCountryCode: 'US',
        dataCategories: req.body.dataCategories || [],
        partnerName: req.body.partnerName
    });
    
    if (result.decision === 'BLOCK') {
        return res.status(403).json({ 
            error: 'Transfer blocked', 
            reason: result.reason 
        });
    }
    
    req.shieldDecision = result;
    next();
};

app.use('/api/ai', shieldMiddleware);`}
                  />
                </div>
              </div>

              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-slate-700 text-sm">
                  <strong>Not using a framework?</strong> The Direct Wrapper pattern works for any language. See <button onClick={() => scrollToSection('code-examples')} className="text-emerald-600 hover:text-emerald-700 underline">Code Examples</button> for curl, Python, and Node.js implementations.
                </p>
              </div>
            </section>

            {/* Authentication */}
            <section
              id="authentication"
              ref={(el) => { sectionRefs.current['authentication'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Authentication</h2>
              <p className="text-slate-700 mb-6">
                All API requests require a Bearer token in the Authorization header.
              </p>
              <CodeBlock
                id="auth-example"
                language="bash"
                code={`Authorization: Bearer ss_test_your_api_key`}
              />
              <div className="mt-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">Header</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Required</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">Authorization</td>
                      <td className="border border-slate-300 px-4 py-2">Yes</td>
                      <td className="border border-slate-300 px-4 py-2">Bearer {`{api_key}`}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">Content-Type</td>
                      <td className="border border-slate-300 px-4 py-2">Yes</td>
                      <td className="border border-slate-300 px-4 py-2">application/json</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-600 text-sm mt-4">
                API keys start with <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">ss_test_</code> for trial accounts and <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">ss_live_</code> for Pro accounts.
              </p>
            </section>

            {/* Agent Registration */}
            <section
              id="agent-registration"
              ref={(el) => { sectionRefs.current['agent-registration'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Agent Registration</h2>
              <p className="text-slate-700 mb-6">
                All evaluate() calls must originate from a registered agent. Sign in to the{' '}
                <a href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` : 'https://app.veridion-nexus.eu/login'} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 underline">
                  dashboard
                </a>
                {' '}and open the Agents section before integrating the API.
              </p>
              <p className="text-slate-700 mb-4">
                Each registered agent receives:
              </p>
              <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
                <li><code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">agent_id</code> — unique identifier (format: agt_XXXXXXXX)</li>
                <li><code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">agent_api_key</code> — secret key shown once at registration (format: agt_key_XXXXXXXX)</li>
              </ul>
              <p className="text-slate-700 mb-6">
                Both are required on every evaluate() call alongside your tenant API key.
              </p>
              <h3 className="text-xl font-semibold text-slate-800 mb-3">Quick registration steps</h3>
              <ol className="list-decimal list-inside text-slate-700 mb-6 space-y-2">
                <li>Sign in to the <a href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` : 'https://app.veridion-nexus.eu/login'} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 underline">dashboard</a> and open the Agents section</li>
                <li>Click &quot;Register New Agent&quot;</li>
                <li>Complete the 5-step wizard (identity, data policy, transfer policy, autonomy &amp; oversight, review)</li>
                <li>Copy your <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">agent_id</code> and <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">agent_api_key</code> — the key is shown only once</li>
              </ol>
            </section>

            {/* Evaluate Transfer */}
            <section
              id="evaluate-transfer"
              ref={(el) => { sectionRefs.current['evaluate-transfer'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Evaluate Transfer</h2>
              <h3 className="text-xl font-semibold text-slate-800 mb-2 font-mono">POST /api/v1/shield/evaluate</h3>
              <p className="text-slate-700 mb-6">
                Evaluates a cross-border data transfer and returns a compliance decision with a cryptographically sealed evidence record.
              </p>

              <h4 className="text-lg font-semibold text-slate-900 mb-3 mt-8">Request body</h4>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">Field</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Type</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Required</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">agent_id</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Required</td>
                      <td className="border border-slate-300 px-4 py-2">Registered agent ID (agt_...). Obtain from the Agents page in the dashboard.</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">agent_api_key</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Required</td>
                      <td className="border border-slate-300 px-4 py-2">Agent API key (agt_key_...). Shown once on registration; rotate via dashboard if lost.</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">destination_country_code</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Yes</td>
                      <td className="border border-slate-300 px-4 py-2">ISO 3166-1 alpha-2 country code (e.g. "US", "CN")</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">data_categories</td>
                      <td className="border border-slate-300 px-4 py-2">array</td>
                      <td className="border border-slate-300 px-4 py-2">Yes (optional, defaults to REVIEW)</td>
                      <td className="border border-slate-300 px-4 py-2">Personal data categories being transferred (e.g. ["email", "name"])</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">partner_name</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">Name of receiving party (e.g. "OpenAI")</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">source_ip</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">Source IP address</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">dest_ip</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">Destination IP address</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">protocol</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">Transfer protocol (e.g. "HTTPS")</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">request_path</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">API endpoint being called</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm">
                Calls without <code className="font-mono">agent_id</code> and <code className="font-mono">agent_api_key</code> return 400 AGENT_REQUIRED. Register your agent in the dashboard before making your first transfer call.
              </p>

              <h4 className="text-lg font-semibold text-slate-900 mb-3">Example request</h4>
              <CodeBlock
                id="evaluate-request"
                language="json"
                code={`{
  "source_system": "my-ai-agent",
  "destination_country_code": "US",
  "data_categories": ["financial"],
  "partner_name": "OpenAI",
  "agent_id": "agt_abc123def456",
  "agent_api_key": "agt_key_abc123..."
}`}
              />

              <h4 className="text-lg font-semibold text-slate-900 mb-3 mt-8">Example responses</h4>
              
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">ALLOW (EU/EEA destination):</p>
                  <CodeBlock
                    id="response-allow-eu"
                    language="json"
                    code={`{
  "decision": "ALLOW",
  "reason": "Germany is EU/EEA — no transfer restrictions",
  "legal_basis": [],
  "country_status": "eu_eea",
  "seal_id": "seal_a1b2c3d4e5f6...",
  "evidence_id": "evt_..."
}`}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">ALLOW (Adequate country):</p>
                  <CodeBlock
                    id="response-allow-adequate"
                    language="json"
                    code={`{
  "decision": "ALLOW", 
  "reason": "Japan has EU adequacy decision",
  "legal_basis": ["GDPR Art. 45"],
  "country_status": "adequate_protection",
  "seal_id": "seal_...",
  "evidence_id": "evt_..."
}`}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">REVIEW (SCC required):</p>
                  <CodeBlock
                    id="response-review"
                    language="json"
                    code={`{
  "decision": "REVIEW",
  "reason": "United States requires SCC — human review needed to verify safeguards",
  "legal_basis": ["GDPR Art. 46(2)(c)"],
  "country_status": "scc_required",
  "seal_id": "seal_...",
  "evidence_id": "evt_..."
}`}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">BLOCK:</p>
                  <CodeBlock
                    id="response-block"
                    language="json"
                    code={`{
  "decision": "BLOCK",
  "reason": "China is blocked — no legal transfer mechanism available",
  "legal_basis": ["GDPR Art. 44", "GDPR Art. 46"],
  "country_status": "blocked",
  "seal_id": "seal_...",
  "evidence_id": "evt_..."
}`}
                  />
                </div>
              </div>
            </section>

            {/* Response Reference */}
            <section
              id="response-reference"
              ref={(el) => { sectionRefs.current['response-reference'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Response Reference</h2>
              
              <h3 className="text-xl font-semibold text-slate-800 mb-3">Response fields</h3>
              <div className="overflow-x-auto mb-8">
                <table className="w-full border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">Field</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Type</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">decision</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">ALLOW, BLOCK, or REVIEW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">reason</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Human-readable explanation</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">legal_basis</td>
                      <td className="border border-slate-300 px-4 py-2">array</td>
                      <td className="border border-slate-300 px-4 py-2">Applicable GDPR articles</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">country_status</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">eu_eea, adequate_protection, scc_required, blocked, unknown</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">seal_id</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Cryptographic seal ID for evidence lookup</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">evidence_id</td>
                      <td className="border border-slate-300 px-4 py-2">string</td>
                      <td className="border border-slate-300 px-4 py-2">Evidence event ID in the vault</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-xl font-semibold text-slate-800 mb-3">Decision logic</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">Destination</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Personal Data</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">SCC Registered</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">EU/EEA country</td>
                      <td className="border border-slate-300 px-4 py-2">Any</td>
                      <td className="border border-slate-300 px-4 py-2">N/A</td>
                      <td className="border border-slate-300 px-4 py-2">ALLOW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Adequate country (Art. 45)</td>
                      <td className="border border-slate-300 px-4 py-2">Any</td>
                      <td className="border border-slate-300 px-4 py-2">N/A</td>
                      <td className="border border-slate-300 px-4 py-2">ALLOW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">SCC-required country</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">N/A</td>
                      <td className="border border-slate-300 px-4 py-2">ALLOW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">SCC-required country</td>
                      <td className="border border-slate-300 px-4 py-2">Yes</td>
                      <td className="border border-slate-300 px-4 py-2">Yes (active)</td>
                      <td className="border border-slate-300 px-4 py-2">ALLOW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">SCC-required country</td>
                      <td className="border border-slate-300 px-4 py-2">Yes</td>
                      <td className="border border-slate-300 px-4 py-2">No</td>
                      <td className="border border-slate-300 px-4 py-2">REVIEW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Blocked country</td>
                      <td className="border border-slate-300 px-4 py-2">Any</td>
                      <td className="border border-slate-300 px-4 py-2">N/A</td>
                      <td className="border border-slate-300 px-4 py-2">BLOCK</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Unknown country</td>
                      <td className="border border-slate-300 px-4 py-2">Any</td>
                      <td className="border border-slate-300 px-4 py-2">N/A</td>
                      <td className="border border-slate-300 px-4 py-2">REVIEW</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Missing data_categories</td>
                      <td className="border border-slate-300 px-4 py-2">—</td>
                      <td className="border border-slate-300 px-4 py-2">—</td>
                      <td className="border border-slate-300 px-4 py-2">REVIEW</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Error Codes */}
            <section
              id="error-codes"
              ref={(el) => { sectionRefs.current['error-codes'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Error Codes</h2>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">HTTP Status</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Code</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">400</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">AGENT_REQUIRED</td>
                      <td className="border border-slate-300 px-4 py-2">Missing agent_id or agent_api_key. Register in the dashboard Agents section</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">400</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">bad_request</td>
                      <td className="border border-slate-300 px-4 py-2">Missing or invalid request body</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">401</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">unauthorized</td>
                      <td className="border border-slate-300 px-4 py-2">Missing or invalid API key</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">402</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">trial_expired</td>
                      <td className="border border-slate-300 px-4 py-2">Trial period has ended</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">422</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">validation_error</td>
                      <td className="border border-slate-300 px-4 py-2">Request validation failed</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">500</td>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">internal_error</td>
                      <td className="border border-slate-300 px-4 py-2">Server error</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-700 mb-3">Error response format:</p>
              <CodeBlock
                id="error-response"
                language="json"
                code={`{
  "error": "unauthorized",
  "message": "Missing or invalid API key"
}`}
              />
            </section>

            {/* Shadow Mode */}
            <section
              id="shadow-mode"
              ref={(el) => { sectionRefs.current['shadow-mode'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Shadow Mode</h2>
              <p className="text-slate-700 mb-6">
                During your 30-day trial, your account starts in Shadow Mode.
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Shadow Mode behaviour</h3>
                  <ul className="space-y-2 text-slate-700">
                    <li>• All transfers are evaluated normally</li>
                    <li>• ALLOW/BLOCK/REVIEW decisions are made and sealed in evidence</li>
                    <li>• Your application always receives ALLOW — nothing is blocked</li>
                    <li>• Use this to understand your transfer risk profile</li>
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Enforce Mode behaviour</h3>
                  <ul className="space-y-2 text-slate-700">
                    <li>• All transfers evaluated normally</li>
                    <li>• BLOCK decisions actually block the transfer (API returns 403)</li>
                    <li>• REVIEW decisions queue for human approval</li>
                    <li>• Available after upgrading to Pro</li>
                  </ul>
                </div>
              </div>
              <p className="text-slate-600 text-sm mt-6">
                Switch between modes in your dashboard under Settings.
              </p>
            </section>

            {/* Code Examples */}
            <section
              id="code-examples"
              ref={(el) => { sectionRefs.current['code-examples'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Code Examples</h2>
              
              {/* Tab Switcher */}
              <div className="flex gap-2 mb-4 border-b border-slate-200">
                <button
                  onClick={() => setCodeTab('curl')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    codeTab === 'curl'
                      ? 'text-emerald-600 border-b-2 border-emerald-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  curl
                </button>
                <button
                  onClick={() => setCodeTab('python')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    codeTab === 'python'
                      ? 'text-emerald-600 border-b-2 border-emerald-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Python
                </button>
                <button
                  onClick={() => setCodeTab('nodejs')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    codeTab === 'nodejs'
                      ? 'text-emerald-600 border-b-2 border-emerald-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Node.js
                </button>
              </div>

              {/* Code Content */}
              <div className="mt-4">
                {codeTab === 'curl' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-600 mb-2">Evaluate a transfer to the US (OpenAI):</p>
                      <CodeBlock
                        id="curl-example-1"
                        language="bash"
                        code={`# Evaluate a transfer to the US (OpenAI)
curl -X POST https://api.veridion-nexus.eu/api/v1/shield/evaluate \\
  -H "Authorization: Bearer ss_test_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destination_country_code": "US",
    "data_categories": ["email", "name"],
    "partner_name": "OpenAI",
    "agent_id": "agt_your_agent_id",
    "agent_api_key": "agt_key_your_agent_api_key"
  }'`}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 mb-2">Evaluate a transfer to Germany (EU/EEA - always ALLOW):</p>
                      <CodeBlock
                        id="curl-example-2"
                        language="bash"
                        code={`# Evaluate a transfer to Germany (EU/EEA - always ALLOW)
curl -X POST https://api.veridion-nexus.eu/api/v1/shield/evaluate \\
  -H "Authorization: Bearer ss_test_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destination_country_code": "DE",
    "data_categories": ["email"],
    "partner_name": "AWS Frankfurt",
    "agent_id": "agt_your_agent_id",
    "agent_api_key": "agt_key_your_agent_api_key"
  }'`}
                      />
                    </div>
                  </div>
                )}

                {codeTab === 'python' && (
                  <CodeBlock
                    id="python-example"
                    language="python"
                    code={`import requests

class SovereignShield:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.veridion-nexus.eu"
    
    def evaluate(
        self, 
        agent_id: str,
        agent_api_key: str,
        destination_country_code: str,
        data_categories: list[str],
        partner_name: str = None
    ) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/shield/evaluate",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            json={
                "agent_id": agent_id,
                "agent_api_key": agent_api_key,
                "destination_country_code": destination_country_code,
                "data_categories": data_categories,
                "partner_name": partner_name
            }
        )
        response.raise_for_status()
        return response.json()

# Usage
shield = SovereignShield(api_key="ss_test_your_key")

# Before calling OpenAI
result = shield.evaluate(
    agent_id="agt_your_agent_id",
    agent_api_key="agt_key_your_agent_api_key",
    destination_country_code="US",
    data_categories=["email", "name"],
    partner_name="OpenAI"
)

if result["decision"] == "BLOCK":
    raise Exception(f"Transfer blocked: {result['reason']}")
elif result["decision"] == "REVIEW":
    queue_for_review(result["seal_id"])
else:
    # ALLOW — proceed
    response = openai.chat.completions.create(...)`}
                  />
                )}

                {codeTab === 'nodejs' && (
                  <CodeBlock
                    id="nodejs-example"
                    language="javascript"
                    code={`class SovereignShield {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.veridion-nexus.eu';
  }

  async evaluate({ agentId, agentApiKey, destinationCountryCode, dataCategories, partnerName }) {
    const res = await fetch(\`\${this.baseUrl}/api/v1/shield/evaluate\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${this.apiKey}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_api_key: agentApiKey,
        destination_country_code: destinationCountryCode,
        data_categories: dataCategories,
        partner_name: partnerName
      })
    });
    
    if (!res.ok) throw new Error(\`Shield API error: \${res.status}\`);
    return res.json();
  }
}

// Usage — wrap your OpenAI calls
const shield = new SovereignShield('ss_test_your_key');

async function callOpenAI(userData) {
  const { decision, reason, seal_id } = await shield.evaluate({
    agentId: 'agt_your_agent_id',
    agentApiKey: 'agt_key_your_agent_api_key',
    destinationCountryCode: 'US',
    dataCategories: ['email', 'name'],
    partnerName: 'OpenAI'
  });

  if (decision === 'BLOCK') throw new Error(\`Blocked: \${reason}\`);
  if (decision === 'REVIEW') {
    await queueForReview(seal_id);
    return null;
  }

  return openai.chat.completions.create({
    messages: [{ role: 'user', content: userData }]
  });
}`}
                  />
                )}
              </div>
            </section>

            {/* MCP Server */}
            <section
              id="mcp-server"
              ref={(el) => { sectionRefs.current['mcp-server'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">MCP Server</h2>
              <p className="text-slate-700 mb-6">
                Veridion Nexus is available as an MCP (Model Context Protocol) server. This makes GDPR transfer evaluation available as a tool in Claude and Cursor workflows, without manual API integration.
              </p>
              <p className="text-slate-600 text-sm mb-6">
                Latest version: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">veridion-nexus-mcp@1.0.8</code>. The <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">evaluate_transfer</code> tool requires <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_id</code> and <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_api_key</code> as parameters on every call.
              </p>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">REST API</h3>
                  <ul className="space-y-2 text-slate-700 text-sm">
                    <li>• Manual integration (~30 minutes)</li>
                    <li>• Add <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">evaluate()</code> call before each transfer</li>
                    <li>• Handle ALLOW/BLOCK/REVIEW in your code</li>
                    <li>• Best for: existing codebases</li>
                  </ul>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">MCP Server</h3>
                  <ul className="space-y-2 text-slate-700 text-sm">
                    <li>• 5-minute setup — JSON config only</li>
                    <li>• Claude and Cursor can call <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">evaluate_transfer</code> as part of their workflow</li>
                    <li>• No code changes to your application</li>
                    <li>• Best for: AI-native applications and agentic workflows</li>
                  </ul>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-slate-900 mb-3">Setup: Claude Desktop</h3>
              <p className="text-slate-600 text-sm mb-3">
                Install using npx: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">npx -y veridion-nexus-mcp</code>
              </p>
              <CodeBlock
                id="mcp-claude-config"
                language="json"
                code={`{
  "mcpServers": {
    "veridion-nexus": {
      "command": "npx",
      "args": ["-y", "veridion-nexus-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key_here"
      }
    }
  }
}`}
              />
              <p className="text-slate-600 text-sm mt-2 mb-8">
                File location: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) or <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">%APPDATA%\Claude\claude_desktop_config.json</code> (Windows)
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3">Setup: Cursor</h3>
              <p className="text-slate-600 text-sm mb-3">
                Install using npx: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">npx -y veridion-nexus-mcp</code>
              </p>
              <CodeBlock
                id="mcp-cursor-config"
                language="json"
                code={`{
  "mcpServers": {
    "veridion-nexus": {
      "command": "npx",
      "args": ["-y", "veridion-nexus-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key_here"
      }
    }
  }
}`}
              />
              <p className="text-slate-600 text-sm mt-2 mb-8">
                File location: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">.cursor/mcp.json</code> in your project root.
              </p>

              <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">Available tools</h3>
              <p className="text-slate-700 mb-3 text-sm">
                The <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">evaluate_transfer</code> tool now requires <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_id</code> and <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_api_key</code> parameters on every call. Sign in to the dashboard and register your agent in the Agents section first.
              </p>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-200">
                      <th className="border border-slate-300 px-4 py-2 text-left">Tool</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">Parameters</th>
                      <th className="border border-slate-300 px-4 py-2 text-left">When to use</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">evaluate_transfer</td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_id</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">agent_api_key</code> (required), destination_country_code, data_categories, partner_name, …
                      </td>
                      <td className="border border-slate-300 px-4 py-2">Before any external API call with personal data</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">check_scc_coverage</td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">destination_country_code, partner_name</td>
                      <td className="border border-slate-300 px-4 py-2">To verify SCC exists for a partner/country</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">get_compliance_status</td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">—</td>
                      <td className="border border-slate-300 px-4 py-2">To get account overview and pending reviews</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-mono text-sm">list_adequate_countries</td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">filter (optional)</td>
                      <td className="border border-slate-300 px-4 py-2">To check a country{"'"}s GDPR transfer status</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Limitations */}
            <section
              id="limitations"
              ref={(el) => { sectionRefs.current['limitations'] = el; }}
              className="mb-16"
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Limitations</h2>
              <p className="text-slate-700 mb-6">
                Veridion Nexus supports demonstrable compliance — it does not guarantee it. Understand these limitations before integrating:
              </p>
              
              <div className="space-y-4">
                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Caller-provided classification</h3>
                  <p className="text-slate-700 text-sm">
                    Veridion Nexus trusts the data_categories you provide. It does not inspect payload content. If you classify personal data incorrectly, the evaluation reflects that.
                  </p>
                </div>

                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Country list is static</h3>
                  <p className="text-slate-700 text-sm">
                    EU adequacy decisions change. The blocked/adequate/SCC-required classification is updated manually — it does not pull live from the EU Commission. Verify current adequacy status at commission.europa.eu.
                  </p>
                </div>

                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Not legal advice</h3>
                  <p className="text-slate-700 text-sm">
                    Veridion Nexus is a technical enforcement and evidence tool. It does not replace a DPO, legal counsel, or a Transfer Impact Assessment. Consult a privacy lawyer for your specific situation.
                  </p>
                </div>

                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">No TIA generation</h3>
                  <p className="text-slate-700 text-sm">
                    Transfer Impact Assessments require legal and factual analysis specific to your organisation. Veridion Nexus does not generate TIAs.
                  </p>
                </div>

                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Shadow Mode does not block</h3>
                  <p className="text-slate-700 text-sm">
                    Veridion Nexus evaluates every transfer and records the real decision — ALLOW, BLOCK, or REVIEW — but always returns ALLOW to your application. No transfers are stopped during Shadow Mode. Use it to observe your risk profile before enabling enforcement.
                  </p>
                </div>

                <div className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">SCC verification is registry-based</h3>
                  <p className="text-slate-700 text-sm">
                    Veridion Nexus checks whether an active SCC exists in your registry for the destination partner. It does not verify the legal validity or completeness of your SCCs.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#0f172a] py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            <div className="space-y-3">
              <div className="mb-2">
                <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
                  <span className="text-lg font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
                  <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
                </h1>
              </div>
              <p className="text-sm text-slate-400">
                Veridion Nexus — GDPR Chapter V Runtime Enforcement
              </p>
              <p className="text-xs text-slate-500">
                © 2026 Veridion Nexus. Built in the EU.
              </p>
            </div>
            <div className="space-y-2">
              <Link href="/docs" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Documentation
              </Link>
              <Link href="/spec" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Spec
              </Link>
              <Link href="/privacy" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Privacy Policy
              </Link>
              <Link href="/terms" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Terms of Service
              </Link>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <span>Data centers:</span>
                <span>Hetzner (EU)</span>
                <span>🇩🇪</span>
              </div>
              <a
                href="mailto:veridion-nexus@protonmail.com"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                veridion-nexus@protonmail.com
              </a>
              <div className="bg-slate-800 border border-slate-700 rounded-full px-3 py-1 inline-block text-xs text-slate-300">
                GDPR Art. 44-49 Infrastructure Supporting Demonstrable Compliance
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
