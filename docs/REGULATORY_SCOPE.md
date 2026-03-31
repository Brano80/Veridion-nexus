# Regulatory scope — GDPR Chapter V (Sovereign Shield)

This document describes how **Veridion Nexus / Sovereign Shield** maps to **GDPR Chapter V** (Arts. 44–49) in code and product behaviour. It is **not legal advice**.

**Country lists last reviewed:** March 2026  
**Maintenance:** Review classification lists **at least quarterly** against the [EU Commission adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en) and official texts.

---

## Art. 45 — Adequacy

Transfers to destinations classified as **adequate** (EU Commission list + internal `ADEQUATE` set) are evaluated as **ALLOW** when personal data is involved, subject to correct caller metadata.

---

## Art. 46 — Appropriate safeguards

### Runtime automation: SCC

The product **automates checks** for **Standard Contractual Clauses (SCC)** via the **SCC registry** (`scc_registries`) for destinations classified as **SCC-required**.

A **registry match does not** by itself prove full legal compliance under **Schrems II** or equivalent (e.g. Transfer Impact Assessment, supplementary measures). See **Limitations** in public documentation.

### Out of automated evaluation (manual / other tools)

Other **Art. 46** mechanisms — including **Binding Corporate Rules (BCR)**, approved codes of conduct, certification mechanisms, etc. — are **not** evaluated by the transfer engine. **Document and evidence** those bases **outside** this runtime (e.g. in your records of processing or legal files). Future product roadmap may add optional flags for BCR-backed paths.

---

## Art. 49 — Derogations

**Derogations** (e.g. specific situations under Art. 49) are **not** automated in the current product. **Out of scope** for runtime enforcement; **roadmap** for possible future support (workflow / evidence only — not legal conclusions).

If you rely on a derogation, that assessment must **remain outside** automated ALLOW/BLOCK decisions unless and until the product explicitly supports it.

---

## Blocked destinations — organisational policy

The **blocked country list** (`BLOCKED` in `src/shield.rs`) reflects **Veridion default organisational / risk policy**, not a claim that **GDPR prohibits transfers to a given ISO country by name**. The GDPR requires a **legal basis** for transfers; it does not enumerate “banned countries” in this form.

**API/UI wording:** Use **“blocked by organizational policy”** (or equivalent), not **“blocked by law”** for this tier.

---

## Unknown / unclassified destinations — conservative default

When a destination is **not** classified as EU/EEA, adequate, SCC-required, blocked, or otherwise known, the engine **BLOCKs** transfers of personal data as a **conservative product default**. That does **not** mean no Chapter V mechanism could ever apply in a given real-world case (e.g. other safeguards assessed by counsel); it means **this runtime does not recognise a path** and refuses by default.

---

## Hardcoded country lists

Classification is **static in code** (and mirrored in the dashboard). It does **not** pull live from the Commission. **Update** lists after official changes and record the **last reviewed** date in this file and in customer-facing docs where relevant.

---

## Related

- Public **Limitations** section: `veridion-landing/app/docs/page.tsx`
- Internal rules: `.cursor/rules/01-regulus.mdc`
- `REGULUS_LEGAL_REVIEW.md`, `REGULUS_SCC_AUDIT.md` (historical audits)
