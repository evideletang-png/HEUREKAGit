# HEUREKA Retrieval Debugging & Observability

This guide explains how to inspect and validate the AI retrieval pipeline used for urbanism compliance analysis.

## 1. Retrieval Scoring Formula

HEUREKA uses a hybrid scoring engine to rank document chunks:

`Final Score = (Semantic * 0.4) + (Authority_Weight * 0.6) + Lexical_Boost`

- **Semantic (Vector)**: Cosine similarity between query and chunk.
- **Authority (Legal Weight)**: Normalized weight (0 to 1) based on document source (e.g., PLU = 0.9, National Law = 1.0).
- **Lexical Boost (Grounding)**: A fixed **+2.0 boost** if the chunk contains an exact keyword or article reference.

## 2. Debugging Tools

### A. Expert View Debug Button (Frontend)
For Dossiers with `admin` or `mairie` permissions, a **"Debug Retrieval Trace"** button appears in the analysis header.
- **Purpose**: Inspect the exact chunks used for each specific comparison (e.g., Height, Parking).
- **Trace Details**: Shows raw similarity scores, lexical boosts, and "Near Miss" exclusion reasons.

### B. Admin Debug API Endpoint
`GET /api/admin/debug/retrieval?query=...&insee=...&zone=...`
- **Use Case**: Testing the retrieval engine for a specific commune without creating a full dossier.
- **Contamination Check**: The response includes a `diagnostics.contamination_detected` flag to verify that City A's query never leaks into City B's document pools.

## 3. Trace Retention Strategy

To optimize database storage while maintaining auditability, HEUREKA uses a multi-tier retention strategy:

| Condition | Retention Level | Purpose |
| :--- | :--- | :--- |
| **Favorable / Auto-OK** | `COMPACT` | Only stores a summary string to save space. |
| **Non-Compliant / Warning**| `FULL` | Stores the complete trace for every grounded chunk. |
| **Low Confidence (< 70%)** | `FULL` | Essential for manual urbanist review. |
| **Debug Mode Requested** | `FULL` | Overrides default settings for troubleshooting. |

## 4. QA Checklist for Retrieval

1. **Verify Isolation**: Use the Debug API for City A and confirm that `diagnostics.active_pools_searched` only contains pools with the City A INSEE or the `GLOBAL` ID.
2. **Verify Boost**: Search for "Article 10" and confirm that the `lexical_score` in the trace is non-zero for results containing that exact text.
3. **Verify Near Misses**: Search for a topic in an archived document. Confirm the trace appears in the "Near Misses" section with `exclusion_reason: 'status:archived'`.
