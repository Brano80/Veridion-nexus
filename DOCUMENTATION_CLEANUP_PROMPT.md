# Documentation Cleanup Prompt for Cursor

## Task 1: Update veridion-landing/app/docs/page.tsx

**Objective:** Replace all occurrences of "Sovereign Shield" with "Veridion Nexus" in human-readable text only.

**Rules:**
- ✅ DO replace "Sovereign Shield" in:
  - Paragraph text
  - Headings and titles
  - Descriptions
  - UI labels and button text
  - Error messages and help text
  
- ❌ DO NOT replace "Sovereign Shield" in:
  - API endpoint paths (e.g., `/api/v1/shield/evaluate`)
  - Code examples (curl, Python, Node.js)
  - Variable names, function names, or method names
  - Tool names (e.g., `evaluate_transfer` tool)
  - JSON keys or API response fields
  - Comments in code blocks

**Specific Changes:**
1. Line 240: "Sovereign Shield works at your application's..." → "Veridion Nexus works at your application's..."
2. Line 251: `<span>Sovereign Shield</span>` → `<span>Veridion Nexus</span>`
3. Line 1073: "Sovereign Shield supports demonstrable compliance..." → "Veridion Nexus supports demonstrable compliance..."
4. Line 1080: "Sovereign Shield trusts the data_categories..." → "Veridion Nexus trusts the data_categories..."
5. Line 1094: "Sovereign Shield is a technical enforcement..." → "Veridion Nexus is a technical enforcement..."
6. Line 1101: "Sovereign Shield does not generate TIAs." → "Veridion Nexus does not generate TIAs."
7. Line 1115: "Sovereign Shield checks whether an active SCC exists..." → "Veridion Nexus checks whether an active SCC exists..."
8. Line 1136: "Sovereign Shield — GDPR Chapter V Runtime Enforcement" → "Veridion Nexus — GDPR Chapter V Runtime Enforcement"

**After completion:** List every line number that was changed.

---

## Task 2: Update veridion-landing/app/page.tsx Footer

**Objective:** Update footer branding text.

**Changes:**
1. Find the footer section (around line 474-531)
2. Verify the tagline already says "Veridion Nexus — GDPR Chapter V Runtime Enforcement" (should already be correct at line 486)
3. If it still says "Sovereign Shield", change it to "Veridion Nexus"

**Note:** The footer links section currently only contains "Documentation" and "Privacy Policy" - no "Dashboard" or "Adequate Countries" links exist, so no removal is needed.

---

## Verification Checklist

After making changes, verify:
- [ ] All "Sovereign Shield" text in docs/page.tsx has been replaced (except in code examples)
- [ ] No API endpoints were modified
- [ ] No code examples were modified
- [ ] Footer tagline says "Veridion Nexus"
- [ ] All changes are listed with line numbers
