// app/spec/page.tsx
// Place at: your-nextjs-app/app/spec/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agent Compliance Data Model v0.1 — Veridion Nexus",
  description:
    "An open, minimal data model for AI agent compliance events. Satisfies GDPR Art. 30, EU AI Act Art. 14, and GDPR Chapter V in a single interoperable schema.",
  openGraph: {
    title: "AI Agent Compliance Data Model v0.1",
    description:
      "Open spec for GDPR/EU AI Act audit trails across the AI agent stack.",
    url: "https://veridion-nexus.eu/spec",
  },
};

const GITHUB_ISSUES = "https://github.com/Veridion-nexus/ai-agent-compliance-spec/issues";
const GITHUB_REPO = "https://github.com/Veridion-nexus/ai-agent-compliance-spec";

export default function SpecPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top bar — nav links match other pages */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between text-sm text-gray-500">
          <a href="/" className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
            Veridion Nexus
          </a>
          <div className="flex items-center gap-6">
            <a href="/docs" className="hover:text-gray-900 transition-colors">
              Documentation
            </a>
            <a href="/spec" className="hover:text-gray-900 transition-colors">
              Spec
            </a>
            <a
              href="https://app.veridion-nexus.eu/login"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900 transition-colors"
            >
              Sign In
            </a>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
            >
              <GitHubIcon />
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="mb-12 pb-10 border-b border-gray-200">
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge color="blue">v0.1</Badge>
            <Badge color="yellow">Draft for Public Comment</Badge>
            <Badge color="gray">CC BY 4.0</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-4">
            AI Agent Compliance Data Model
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            A minimal, interoperable data model for AI agent compliance events — designed to satisfy
            GDPR Art. 30, EU AI Act Art. 14, and GDPR Chapter V from a single shared schema.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              <GitHubIcon />
              Open an Issue
            </a>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Read on GitHub
            </a>
          </div>
          <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <MetaItem label="Published by" value="Veridion Nexus" />
            <MetaItem label="Version" value="0.1 — Draft" />
            <MetaItem label="License" value="CC BY 4.0" />
            <MetaItem label="Published" value="2026-03-20" />
          </dl>
        </header>

        {/* Navigation */}
        <nav className="mb-12 p-5 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contents</p>
          <ol className="space-y-1.5 text-sm">
            {[
              ["why", "Why This Exists"],
              ["scope", "Scope"],
              ["agent-record", "1. AgentRecord"],
              ["tool-call-event", "2. ToolCallEvent"],
              ["data-transfer-record", "3. DataTransferRecord"],
              ["context-trust-annotation", "4. ContextTrustAnnotation"],
              ["human-oversight-record", "5. HumanOversightRecord"],
              ["relationships", "Event Relationships"],
              ["implementation", "Implementation Guidance"],
              ["out-of-scope", "What This Spec Does Not Cover"],
              ["existing-standards", "Relationship to Existing Standards"],
              ["version-history", "Version History"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Body */}
        <div className="prose-spec">

          <Section id="why" title="Why This Exists">
            <p>
              AI agents make autonomous decisions, call external tools, and transfer data across
              jurisdictions — often faster than any human oversight loop. The compliance infrastructure
              around them is fragmented: security tools track what tools were called, IT governance tools
              track which agents exist, and legal/privacy tools track data flows. None of them share a
              common data model.
            </p>
            <p>
              This means a DPO auditing an HR screening agent, a regulator assessing an EU AI Act Annex
              III system, and a CISO investigating a potential prompt injection incident are all looking
              at different records — or no records at all.
            </p>
            <p>This specification defines a minimal, interoperable data model for AI agent compliance events. It is designed to be:</p>
            <ul>
              <li><strong>Implementable by any tool</strong> — security, governance, or compliance</li>
              <li><strong>Composable</strong> — the same event stream should satisfy GDPR Art. 30 (records of processing), EU AI Act Art. 14 (human oversight), and internal audit requirements</li>
              <li><strong>Extensible</strong> — v0.1 defines the floor, not the ceiling</li>
            </ul>
            <p>
              The goal is not a new standard to replace existing ones. It is a shared vocabulary so that
              tools operating at different layers of the agent stack can produce records that fit together.
            </p>
          </Section>

          <Section id="scope" title="Scope">
            <p>This version covers five core object types:</p>
            <Table
              headers={["Object", "What it captures", "Primary regulatory relevance"]}
              rows={[
                [<Code>AgentRecord</Code>, "Identity and policy profile of an agent", "GDPR Art. 30, EU AI Act Art. 16"],
                [<Code>ToolCallEvent</Code>, "A single tool invocation by an agent", "GDPR Art. 5(1)(c) data minimization, EU AI Act Art. 14"],
                [<Code>DataTransferRecord</Code>, "A cross-border personal data transfer", "GDPR Chapter V (Arts. 44–49)"],
                [<Code>ContextTrustAnnotation</Code>, "Trust level of data present in agent context at decision time", "EU AI Act Art. 14, GDPR Art. 22"],
                [<Code>HumanOversightRecord</Code>, "A human review or override of an agent decision", "EU AI Act Art. 14"],
              ]}
            />
          </Section>

          <Section id="agent-record" title="1. AgentRecord">
            <p>
              Represents a registered AI agent. Should be created when an agent is deployed and updated
              when its capabilities or policies change.
            </p>
            <CodeBlock>{`{
  "schema": "acm/agent-record/v0.1",
  "agent_id": "agt_7f3a9c",
  "display_name": "HR Screening Agent",
  "version": "2.1.0",
  "owner": {
    "organization": "Acme Corp",
    "team": "People Operations",
    "contact": "dpo@acme.com"
  },
  "deployment": {
    "environment": "production",
    "region": "eu-west-1",
    "data_residency": "DE",
    "first_deployed_at": "2026-01-15T09:00:00Z"
  },
  "classification": {
    "eu_ai_act_risk_level": "high",
    "eu_ai_act_annex": "III",
    "processes_personal_data": true,
    "special_categories": ["employment_decisions"],
    "automated_decision_making": true
  },
  "tools_permitted": ["cv_parser", "calendar_api", "email_sender"],
  "transfer_policies": ["policy_eu_only", "policy_scc_us"],
  "a2a_card_url": "https://acme.com/.well-known/agent-cards/hr-screening.json",
  "registered_at": "2026-01-15T09:00:00Z",
  "last_updated_at": "2026-03-01T14:22:00Z"
}`}</CodeBlock>
            <h3>Field reference</h3>
            <Table
              headers={["Field", "Type", "Required", "Notes"]}
              rows={[
                [<Code>agent_id</Code>, "string", "✓", "Stable unique identifier for the agent across its lifecycle"],
                [<Code>display_name</Code>, "string", "✓", "Human-readable name"],
                [<Code>version</Code>, "string", "✓", "Semantic version of the agent"],
                [<Code>owner.organization</Code>, "string", "✓", "Legal entity responsible (controller in GDPR terms)"],
                [<Code>owner.contact</Code>, "string", "✓", "DPO or responsible team contact"],
                [<Code>deployment.data_residency</Code>, "ISO 3166-1 alpha-2", "✓", "Country where agent data is primarily processed"],
                [<Code>classification.eu_ai_act_risk_level</Code>, "enum: minimal, limited, high, unacceptable", "✓ if EU deployment", "Self-classification under EU AI Act"],
                [<Code>classification.automated_decision_making</Code>, "boolean", "✓", "Triggers GDPR Art. 22 obligations if true"],
                [<Code>tools_permitted</Code>, "string[]", "✓", "Allowlist of tool identifiers the agent may call"],
                [<Code>transfer_policies</Code>, "string[]", "○", "References to applicable GDPR Chapter V transfer mechanisms"],
                [<Code>a2a_card_url</Code>, "URL", "○", "Link to A2A-compatible agent card for interoperability"],
              ]}
            />
          </Section>

          <Section id="tool-call-event" title="2. ToolCallEvent">
            <p>
              Represents a single tool invocation. Every time an agent calls an external tool, a
              ToolCallEvent should be emitted. This is the primary record for data minimization audits
              and AI Act oversight.
            </p>
            <CodeBlock>{`{
  "schema": "acm/tool-call-event/v0.1",
  "event_id": "evt_a3f81b",
  "agent_id": "agt_7f3a9c",
  "session_id": "sess_9d2e4f",
  "tool_id": "cv_parser",
  "tool_version": "1.4.2",
  "called_at": "2026-03-20T11:34:52Z",
  "inputs": {
    "fields_requested": ["name", "email", "work_history"],
    "data_subjects": 1,
    "contains_special_categories": false
  },
  "outputs": {
    "fields_returned": ["name", "email", "work_history", "inferred_age"],
    "data_subjects": 1
  },
  "context_trust": {
    "level": "degraded",
    "degraded_by": "external_document",
    "degraded_at": "2026-03-20T11:34:10Z",
    "annotation_ref": "cta_7c1a3e"
  },
  "outcome": {
    "decision_made": true,
    "decision_type": "candidate_shortlisted",
    "human_review_required": true,
    "oversight_record_ref": "hor_2b9f5a"
  },
  "legal_basis": "legitimate_interests",
  "purpose": "employment_screening"
}`}</CodeBlock>
            <h3>Field reference</h3>
            <Table
              headers={["Field", "Type", "Required", "Notes"]}
              rows={[
                [<Code>event_id</Code>, "string", "✓", "Unique, immutable identifier for this event"],
                [<Code>agent_id</Code>, "string", "✓", "References AgentRecord"],
                [<Code>session_id</Code>, "string", "✓", "Groups related events in a single agent session"],
                [<Code>tool_id</Code>, "string", "✓", <>Must match an entry in <Code>AgentRecord.tools_permitted</Code></>],
                [<Code>called_at</Code>, "ISO 8601", "✓", "UTC timestamp"],
                [<Code>inputs.fields_requested</Code>, "string[]", "✓", "What the agent asked for — key for minimization audit"],
                [<Code>outputs.fields_returned</Code>, "string[]", "✓", "What was actually returned — excess = potential violation"],
                [<Code>context_trust.level</Code>, "enum: trusted, degraded, untrusted", "✓", "Trust level of agent context at call time"],
                [<Code>outcome.decision_made</Code>, "boolean", "✓", "Whether this call contributed to an automated decision"],
                [<Code>outcome.human_review_required</Code>, "boolean", "✓", "Required for EU AI Act Annex III systems"],
                [<Code>legal_basis</Code>, "string", "✓", "GDPR Art. 6 legal basis for processing"],
              ]}
            />
            <Note>
              If <Code>context_trust.level</Code> is <Code>degraded</Code> or <Code>untrusted</Code> and{" "}
              <Code>outcome.decision_made</Code> is <Code>true</Code> for a high-risk AI system, this
              event should be automatically flagged for human review and referenced in the
              HumanOversightRecord.
            </Note>
          </Section>

          <Section id="data-transfer-record" title="3. DataTransferRecord">
            <p>
              Represents a personal data transfer to a third country or international organization under
              GDPR Chapter V. Should be emitted whenever an agent call results in personal data leaving
              the EEA.
            </p>
            <CodeBlock>{`{
  "schema": "acm/data-transfer-record/v0.1",
  "transfer_id": "xfr_5c2d7a",
  "agent_id": "agt_7f3a9c",
  "event_ref": "evt_a3f81b",
  "transferred_at": "2026-03-20T11:34:53Z",
  "origin": {
    "jurisdiction": "EU",
    "data_residency": "DE"
  },
  "destination": {
    "jurisdiction": "US",
    "recipient": "OpenAI Inc.",
    "recipient_country": "US",
    "service_endpoint": "api.openai.com"
  },
  "transfer_mechanism": {
    "type": "scc",
    "scc_version": "2021/914/EU",
    "module": "2",
    "executed_at": "2025-11-01T00:00:00Z",
    "document_ref": "vault://scc/openai-2025-11-01.pdf"
  },
  "data": {
    "categories": ["professional_history", "contact_information"],
    "special_categories": [],
    "data_subjects_count": 1,
    "pseudonymised": false
  },
  "adequacy_decision_applicable": false,
  "dpf_relied_upon": false,
  "blocked": false,
  "block_reason": null
}`}</CodeBlock>
            <h3>Transfer mechanism types</h3>
            <Table
              headers={["type value", "Description", "Relevant GDPR Article"]}
              rows={[
                [<Code>adequacy</Code>, "Transfer to adequate country", "Art. 45"],
                [<Code>scc</Code>, "Standard Contractual Clauses", "Art. 46(2)(c)"],
                [<Code>bcr</Code>, "Binding Corporate Rules", "Art. 47"],
                [<Code>dpf</Code>, "EU-US Data Privacy Framework", "Art. 45 (adequacy decision 2023)"],
                [<Code>derogation</Code>, "Specific situation derogation", "Art. 49"],
                [<Code>blocked</Code>, "Transfer blocked — no valid mechanism", "—"],
              ]}
            />
            <Note>
              If <Code>dpf_relied_upon</Code> is <Code>true</Code>, implementations should expose a flag
              to mass-update all affected records in the event of a DPF invalidation (Schrems III
              scenario). Records relying on DPF should be queryable as a group.
            </Note>
          </Section>

          <Section id="context-trust-annotation" title="4. ContextTrustAnnotation">
            <p>
              Captures the trust state of an agent's context window at a point in time. Inspired by
              AgentLock v1.1's context trust model. Intended to be referenced by ToolCallEvents and
              HumanOversightRecords.
            </p>
            <CodeBlock>{`{
  "schema": "acm/context-trust-annotation/v0.1",
  "annotation_id": "cta_7c1a3e",
  "agent_id": "agt_7f3a9c",
  "session_id": "sess_9d2e4f",
  "evaluated_at": "2026-03-20T11:34:10Z",
  "trust_level": "degraded",
  "sources_in_context": [
    {
      "source_type": "external_document",
      "source_identifier": "cv_upload_20260320_candidate_88.pdf",
      "introduced_at": "2026-03-20T11:34:08Z",
      "trust_classification": "untrusted"
    },
    {
      "source_type": "internal_system",
      "source_identifier": "hr_database",
      "introduced_at": "2026-03-20T11:33:50Z",
      "trust_classification": "trusted"
    }
  ],
  "degradation_trigger": {
    "source_type": "external_document",
    "introduced_at": "2026-03-20T11:34:08Z",
    "reason": "unverified_external_content_entered_context"
  },
  "session_trust_persistent": true
}`}</CodeBlock>
            <h3>Trust levels</h3>
            <Table
              headers={["Level", "Meaning"]}
              rows={[
                [<Code>trusted</Code>, "All data in context originates from verified internal sources"],
                [<Code>degraded</Code>, "At least one untrusted external source has entered context this session"],
                [<Code>untrusted</Code>, "Context is primarily or entirely from external / unverified sources"],
              ]}
            />
            <p>
              <Code>session_trust_persistent: true</Code> means that once degraded, trust does not
              recover within the session — consistent with AgentLock v1.1 semantics.
            </p>
          </Section>

          <Section id="human-oversight-record" title="5. HumanOversightRecord">
            <p>
              Records a human review, intervention, or override of an agent decision. Required for EU AI
              Act Annex III systems under Art. 14. Should reference the ToolCallEvent that triggered the
              review.
            </p>
            <CodeBlock>{`{
  "schema": "acm/human-oversight-record/v0.1",
  "record_id": "hor_2b9f5a",
  "agent_id": "agt_7f3a9c",
  "event_ref": "evt_a3f81b",
  "reviewer": {
    "reviewer_id": "usr_hr_manager_42",
    "role": "HR Manager",
    "organization": "Acme Corp"
  },
  "review_triggered_by": "degraded_context_trust",
  "review_initiated_at": "2026-03-20T11:40:00Z",
  "review_completed_at": "2026-03-20T11:47:23Z",
  "agent_decision": {
    "decision_type": "candidate_shortlisted",
    "confidence_score": 0.87,
    "reasoning_summary": "Candidate meets 7 of 9 required criteria"
  },
  "reviewer_outcome": {
    "action": "overridden",
    "override_reason": "Candidate's gap year misclassified as unemployment",
    "final_decision": "candidate_shortlisted",
    "notes": "Agent reasoning was valid but factual error in CV parsing triggered manual correction."
  },
  "eu_ai_act_compliance": {
    "art_14_satisfied": true,
    "human_had_meaningful_control": true,
    "override_capability_tested": false
  }
}`}</CodeBlock>
            <h3>review_triggered_by values</h3>
            <Table
              headers={["Value", "Description"]}
              rows={[
                [<Code>degraded_context_trust</Code>, "ContextTrustAnnotation showed degraded/untrusted trust"],
                [<Code>high_impact_decision</Code>, "Decision type mandates review per agent policy"],
                [<Code>anomaly_detected</Code>, "Monitoring layer flagged unusual behaviour"],
                [<Code>manual_request</Code>, "Human proactively requested review"],
                [<Code>periodic_audit</Code>, "Scheduled sampling review"],
              ]}
            />
          </Section>

          <Section id="relationships" title="Event Relationships">
            <CodeBlock>{`AgentRecord
    └── ToolCallEvent (many per agent session)
            ├── ContextTrustAnnotation (one per evaluation)
            ├── DataTransferRecord (zero or many per call)
            └── HumanOversightRecord (zero or one per call)`}</CodeBlock>
            <p>A single HR screening session might produce:</p>
            <ul>
              <li>1 <Code>AgentRecord</Code> (the agent, registered at deployment)</li>
              <li>12 <Code>ToolCallEvents</Code> (each tool invocation in the session)</li>
              <li>1 <Code>ContextTrustAnnotation</Code> (trust degraded when CV uploaded)</li>
              <li>3 <Code>DataTransferRecords</Code> (calls to US-based LLM API, 3 times)</li>
              <li>1 <Code>HumanOversightRecord</Code> (triggered by degraded trust on the final decision)</li>
            </ul>
            <p>
              Together, these five records constitute a complete Art. 30 processing entry, an Art. 14
              oversight log, and a Chapter V transfer audit trail — from a single agent session.
            </p>
          </Section>

          <Section id="implementation" title="Implementation Guidance">
            <h3>Minimum viable implementation</h3>
            <p>A tool implementing this spec should, at minimum:</p>
            <ol>
              <li>Emit <Code>ToolCallEvents</Code> with <Code>context_trust.level</Code> and <Code>outcome.decision_made</Code> populated</li>
              <li>Emit <Code>DataTransferRecords</Code> for any call that routes personal data outside the EEA</li>
              <li>Store records in an append-only, tamper-evident log</li>
            </ol>
            <h3>Interoperability</h3>
            <p>Tools may implement any subset of this model. Cross-tool interoperability is achieved by:</p>
            <ul>
              <li>Using <Code>agent_id</Code> as the shared key across all records</li>
              <li>Referencing related records by their IDs (<Code>event_ref</Code>, <Code>annotation_ref</Code>, <Code>oversight_record_ref</Code>)</li>
              <li>Exposing records via a REST endpoint at <Code>/.well-known/acm/</Code> on the implementing service</li>
            </ul>
            <h3>Suggested endpoint structure</h3>
            <CodeBlock>{`GET /.well-known/acm/agents/{agent_id}           → AgentRecord
GET /.well-known/acm/events?agent_id=&from=&to=  → ToolCallEvent[]
GET /.well-known/acm/transfers?agent_id=          → DataTransferRecord[]
GET /.well-known/acm/oversight?agent_id=          → HumanOversightRecord[]`}</CodeBlock>
          </Section>

          <Section id="out-of-scope" title="What This Spec Does Not Cover (v0.2 candidates)">
            <ul>
              <li>Consent records and withdrawal events</li>
              <li>Data subject access request (DSAR) workflow events</li>
              <li>Agent-to-agent (A2A) delegation chains and inherited trust</li>
              <li>Cryptographic signing of records (tamper evidence)</li>
              <li>Retention and deletion schedules per record type</li>
              <li>Mapping to specific national DPA reporting formats</li>
            </ul>
            <p>
              Contributions and proposals for v0.2 are welcome via{" "}
              <a href={GITHUB_ISSUES} target="_blank" rel="noopener noreferrer">
                GitHub Issues
              </a>
              .
            </p>
          </Section>

          <Section id="existing-standards" title="Relationship to Existing Standards">
            <p>This spec is designed to be complementary, not competing:</p>
            <Table
              headers={["Standard / Framework", "Relationship"]}
              rows={[
                ["GDPR Art. 30 (Records of Processing)", <><Code>AgentRecord</Code> + <Code>DataTransferRecord</Code> together satisfy Art. 30(1) record requirements for AI agents</>],
                ["EU AI Act Art. 14 (Human Oversight)", <><Code>HumanOversightRecord</Code> is a direct implementation artifact</>],
                ["A2A Protocol (Google)", <><Code>AgentRecord.a2a_card_url</Code> links to A2A agent card; signed card data can extend this record</>],
                ["MCP (Anthropic)", <><Code>ToolCallEvent</Code> maps to MCP tool call semantics; MCP server implementations can emit events natively</>],
                ["AgentLock v1.1", <><Code>ContextTrustAnnotation</Code> formalises AgentLock's trust level concept as a loggable compliance record</>],
                ["OpenTelemetry", "Record IDs and timestamps are compatible with OTel trace/span conventions for correlation"],
              ]}
            />
          </Section>

          <Section id="version-history" title="Version History">
            <Table
              headers={["Version", "Date", "Summary"]}
              rows={[
                ["0.1", "2026-03-20", "Initial draft. Five core objects: AgentRecord, ToolCallEvent, DataTransferRecord, ContextTrustAnnotation, HumanOversightRecord."],
              ]}
            />
          </Section>

        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-200 text-sm text-gray-500">
          <p>
            AI Agent Compliance Data Model v0.1 is published by{" "}
            <a href="https://veridion-nexus.eu" className="text-gray-700 hover:text-gray-900 underline">
              Veridion Nexus
            </a>{" "}
            under{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 hover:text-gray-900 underline"
            >
              CC BY 4.0
            </a>
            . Free to implement, adapt, and build on with attribution.
          </p>
          <p className="mt-2">
            Feedback and contributions welcome via{" "}
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 hover:text-gray-900 underline"
            >
              GitHub Issues
            </a>
            .
          </p>
        </footer>
      </main>

      <style>{`
        .prose-spec h3 {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-spec p {
          margin-bottom: 1rem;
          line-height: 1.7;
          color: #374151;
        }
        .prose-spec ul, .prose-spec ol {
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }
        .prose-spec li {
          margin-bottom: 0.375rem;
          line-height: 1.6;
          color: #374151;
        }
        .prose-spec ul li { list-style-type: disc; }
        .prose-spec ol li { list-style-type: decimal; }
        .prose-spec a {
          color: #2563eb;
          text-decoration: underline;
        }
        .prose-spec a:hover { color: #1d4ed8; }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-5 pb-3 border-b border-gray-100">
        <a href={`#${id}`} className="hover:text-blue-600 transition-colors no-underline">
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-950 text-gray-100 rounded-xl p-5 overflow-x-auto text-sm leading-relaxed mb-6 font-mono">
      <code>{children}</code>
    </pre>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mb-6 rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-700 align-top border-b border-gray-100 last:border-0">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-900 leading-relaxed">
      <span className="font-semibold">Implementation note: </span>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: string; color: "blue" | "yellow" | "gray" }) {
  const styles = {
    blue: "bg-blue-100 text-blue-700",
    yellow: "bg-yellow-100 text-yellow-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wider font-medium">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
