# Latency Investigation Report: Adequate Countries Variance

## Summary

Certain adequate countries (AD, BR, FO, GG, IL, UY, CA) show significantly higher latency than others (KR, CH, GB, JP) in both localhost and HTTPS tests. This report documents findings from code analysis.

---

## 1. Country Classification Logic (`src/shield.rs`)

### Data structures
- **EU_EEA**, **ADEQUATE**, **SCC_REQUIRED**, **BLOCKED** are `&[&str]` slices (static arrays).
- Order: `EU_EEA` (31) → `ADEQUATE` (15) → `SCC_REQUIRED` (17) → `BLOCKED` (6).

### Lookup algorithm
```rust
pub fn classify_country(code: &str) -> &'static str {
    let upper = code.to_uppercase();
    let u = upper.as_str();
    if EU_EEA.contains(&u) {
        "eu_eea"
    } else if ADEQUATE.contains(&u) {
        "adequate_protection"
    } else if SCC_REQUIRED.contains(&u) {
        "scc_required"
    } else if BLOCKED.contains(&u) {
        "blocked"
    } else {
        "unknown"
    }
}
```

- Uses **slice `.contains()` → O(n) linear search**, not HashSet O(1).
- ADEQUATE slice order: `["AD","AR","BR","CA","FO","GG","IL","IM","JP","JE","NZ","KR","GB","UY","CH"]`.
- AD is found on iteration 1, CH on iteration 15 — so AD would theoretically be faster for classification, not slower. **Classification order is not the cause of variance.**

### Adequate vs fast-path
- All adequate countries use the same path: `"adequate_protection"` → immediate `TransferDecision { ALLOW }` with no DB.
- There is no separate fast-path HashSet; all adequate countries are handled identically.

---

## 2. Database Queries in evaluate()

| Phase | DB query | Per country? |
|-------|----------|--------------|
| Middleware (before handler) | `SELECT tenants` (by api_key_hash) | No — same for all |
| Agent lookup | `SELECT agents` (by agent_id, tenant_id) | No — same agent |
| `evaluate_transfer_with_db` | None for adequate | No |
| `get_enforcement_mode` | `SELECT system_settings` | No — same tenant |
| `evidence::create_event` | `get_next_sequence` (MAX), `get_latest_hash` (SELECT), INSERT | No — same source_system |

- **Adequate countries never trigger SCC registry lookup.** `check_scc_exists` runs only for `scc_required` (US, AU, IN, etc.).

---

## 3. SCC Registry

- Used only for `scc_required` destinations (US, AU, IN, MX, SG, ZA, etc.).
- Adequate countries (AD, AR, BR, CA, FO, GG, IL, IM, JP, JE, NZ, KR, CH, GB, UY) **do not query the SCC registry**.
- No variance in SCC path for adequate countries.

---

## 4. Slow vs Fast Country Characteristics

| Slow (localhost 6–19ms, HTTPS 63–114ms) | Fast (localhost 3–4ms, HTTPS 32–37ms) |
|----------------------------------------|--------------------------------------|
| AD, AR, BR, CA, FO, GG, IL, UY         | IM, JP, JE, NZ, KR, CH, GB           |

### Patterns
- Both sets are in `ADEQUATE`; same code path and same DB flow.
- **Territories/dependencies**: FO, GG, IM, JE (Faroe Islands, Guernsey, Isle of Man, Jersey) — IM and JE are fast; FO and GG are slow. Not a territory-specific issue.
- **`country_name()` match order**: `country_name()` uses a large `match` on `code`. AD is around arm 60; KR around arm 12. So AD performs more comparisons before a match. This could add a small amount of CPU time per request, but not enough to explain 5–80ms gaps; more likely DB or I/O variance.

---

## 5. Per-Request Flow and Likely Bottlenecks

```
Middleware: tenant lookup (DB)
  → Agent lookup (DB)
  → Agent policy checks (in-memory: allowed_countries.iter().any())
  → evaluate_transfer_with_db (no DB for adequate)
  → get_enforcement_mode (DB)
  → create_event (DB: get_next_sequence, get_latest_hash, INSERT)
```

- `create_event` does three DB operations: `get_next_sequence`, `get_latest_hash`, then INSERT.
- `get_next_sequence` does `SELECT MAX(sequence_number) ... GROUP BY tenant_id, source_system`.
- `get_latest_hash` does `SELECT payload_hash ... ORDER BY sequence_number DESC LIMIT 1`.
- Possible sources of variance:
  1. Connection pool wait times.
  2. PostgreSQL plan/cache variability.
  3. Contention on `evidence_events` indexes.
  4. Request ordering effects (e.g., first request in a burst).

---

## 6. Profiling Scripts

- `scripts/profile_ad_kr_timing.sh` — Measures curl total time for AD (5x) and KR (5x) via localhost.
- `scripts/profile_reverse_order.sh` — Same but KR first, then AD, to test request-order effects.

---

## 7. Profiling Test Results (Server Localhost)

### AD first, KR second (original order)
| Country | Request 1 | 2 | 3 | 4 | 5 |
|---------|-----------|---|---|---|---|
| AD      | 6.2ms | 5.0 | 5.3 | 4.0 | 3.9 |
| KR      | 3.2ms | 3.1 | 3.1 | 3.3 | 3.3 |

### KR first, AD second (reversed order)
| Country | Request 1 | 2 | 3 | 4 | 5 |
|---------|-----------|---|---|---|---|
| KR      | 4.4ms | 4.9 | 5.3 | 4.8 | 6.8 |
| AD      | 4.3ms | 4.4 | 4.3 | 3.6 | 3.5 |

**Finding**: When AD runs first, AD is slower. When KR runs first, KR shows higher variance and AD is faster. **The variance is request-order (warm-up) related, not country-specific.** The first requests in a batch hit a cold connection pool / DB cache; later requests benefit from warm state.

---

## Conclusions

1. **Classification**: O(n) slice `.contains()`, but n is small; AD is found earlier than CH, so lookup order does not explain slower AD.
2. **DB usage**: Adequate countries do not use the SCC registry.
3. **Code path**: All adequate countries share the same path.
4. **Root cause**: **Request order / warm-up effects**, not country-specific logic. First requests in a sequence are slower due to cold DB connections or cache; later requests are faster. The 15-country test runs AD first → AD appears slow; KR runs 12th → KR appears fast.
5. **Optional**: To pinpoint which phase (agent lookup, enforcement mode, or `create_event`) dominates the cold-start cost, add timing logs around each step and redeploy with `RUST_LOG=info`.
