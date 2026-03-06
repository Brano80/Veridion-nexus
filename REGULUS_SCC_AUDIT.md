# REGULUS: SCC & Country List Audit

## Summary

Audit of SCC logic and country lists in Sovereign Shield (SS). One bug found and fixed.

---

## 1. Country List Consistency (Backend vs Frontend)

| List | Backend (shield.rs) | Frontend (countries.ts) | Match |
|------|---------------------|-------------------------|-------|
| EU_EEA | AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE, IS, LI, NO | Same | ✓ |
| ADEQUATE | AD, AR, BR, CA, FO, GG, IL, IM, JP, JE, NZ, KR, GB, UY, CH | Same | ✓ |
| SCC_REQUIRED | US, AU, IN, MX, SG, KR, ZA, ID, TR, PH, VN, EG, NG, PK, BD, TH, MY | Same (KR removed) | ✓ Fixed |
| BLOCKED | CN, RU, KP, IR, SY, BY | Same | ✓ |

### Bug: South Korea (KR) in both ADEQUATE and SCC_REQUIRED

- **EU law**: South Korea has an adequacy decision (Dec 2021). Transfers do not require SCC.
- **Backend**: Classification order is EU_EEA → ADEQUATE → SCC_REQUIRED → BLOCKED. KR is checked as ADEQUATE first, so backend correctly returns `adequate_protection`.
- **Frontend**: `getLegalBasis()` checked SCC_REQUIRED before ADEQUATE, so KR would incorrectly show "Art. 46 SCC" instead of "Art. 45".
- **Fix**: Removed KR from SCC_REQUIRED in both backend and frontend. Reordered `getLegalBasis()` to check ADEQUATE before SCC_REQUIRED for defense in depth.

---

## 2. SCC Logic Verification

### Backend (shield.rs)

- **check_scc_exists()**: Queries `scc_registries` by `partner_name` and `destination_country_code`; filters `status = 'active'` and non-expired. ✓
- **evaluate_transfer_with_db()**: For `scc_required` countries with personal data, calls `check_scc_exists(pool, partner, &code)`. On match → ALLOW; else → REVIEW. ✓
- **Classification order**: EU_EEA → ADEQUATE → SCC_REQUIRED → BLOCKED → unknown. Correct. ✓

### Frontend SCC Matching

- **SovereignMap.hasValidSCCForPartner()**: Compares `scc.destinationCountry` (mapped from API `destinationCountryCode`) with event country code via `getCountryCodeFromName()`. Handles both code and name. ✓
- **page.tsx Requires Attention**: Uses `scc.destinationCountry.toUpperCase() !== countryCode` for SCC validation. API returns code in `destinationCountry` when mapped from `destinationCountryCode`. ✓
- **approve_pending_reviews_for_scc**: Backend compares `ee.payload->>'destination_country_code'` with SCC `destination_country_code`. ✓

### SCC Registry API

- **Storage**: `scc_registries.destination_country_code` (VARCHAR(2)) — ISO code. ✓
- **Response**: `destinationCountryCode` in JSON. Frontend maps to `destinationCountry` for compatibility. ✓
- **Auto-approve**: On SCC registration, `approve_pending_reviews_for_scc()` finds pending reviews with matching `destination_country_code` and approves. ✓

---

## 3. SovereignMap Country Classification

- **isSccRequiredCountry()**: `SCC_REQUIRED_COUNTRIES.has(code) || (!EU_EEA && !ADEQUATE && !BLOCKED)` — third countries default to SCC required. ✓
- **Map colors**: Green (adequate/EU), Red (blocked + BLOCK decision), Orange fill (unresolved REVIEW), Orange border (SCC-covered or decided). ✓

---

## 4. Recommendations

1. **Single source of truth**: Consider generating frontend country sets from a shared config or API to avoid drift.
2. **SCC expiry**: Backend uses `expires_at`; frontend `status === 'Valid'` and `expiryDate > new Date()`. Align if backend returns different status values.
3. **UK (GB)**: In ADEQUATE. Post-Brexit UK has adequacy. ✓
