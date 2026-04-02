# HEUREKA Authority Ranking Policy

To ensure accurate, legally grounded urbanism analysis, HEUREKA implements an **Authority-Weighted Retrieval** system. This prevents "fuzzy" semantic matches from low-authority sources (e.g., user sketches) from outranking actual regulations (e.g., PLU Articles).

## 1. Authority Levels (1-10)

Every document in the HEUREKA Knowledge Base is assigned a `source_authority` score:

| Level | Document Type | Description |
| :--- | :--- | :--- |
| **10** | **LAW_NATIONAL** | Code de l'Urbanisme, RNU (Règlement National d'Urbanisme). The final word in French law. |
| **9** | **REGULATION_LOCAL** | **PLU / PLUi Règlement Écrit**. Legally binding local rules for a specific zone. |
| **8** | **PLANNING_OAP** | Orientations d'Aménagement et de Programmation. Contextual planning directives. |
| **7** | **ANNEX_PATRIMOINE** | ABF (Architectes des Bâtiments de France) regulations, Protected Heritage areas. |
| **6** | **ANNEX_RISK** | PPRN (Natural Risks), PPRT (Technological Risks). Crucial security constraints. |
| **5** | **ANNEX_TECHNICAL** | Infrastructure maps, utility constraints (networks, sanitation). |
| **4** | **NOTICE_DESCRIPTIVE** | Architect's project description. High semantic relevance to project but NOT a rule source. |
| **3** | **ADMIN_GUIDE** | Internal municipality guides or checklists. |
| **2** | **USER_SKETCH** | Rough user descriptions or uploaded napkin sketches. Low reliability. |
| **1** | **UNKNOWN** | Default for unclassified or unranked snippets. |

## 2. Ranking Algorithm (Hybrid Weighted Similarity)

The retrieval engine computes a final `evidence_score` for each piece of text:

```
Evidence Score = (Vector Similarity * 0.4) + (Authority Weight * 0.6)
```

*   **Vector Similarity**: Pure semantic match from `text-embedding-3-small`.
*   **Authority Weight**: Scalar transformation of the 1-10 rank.
*   **Lexical Factor**: Exact matches on `article_id` or specific `zone` codes provide a +2.0 "Grounding Boost".

## 3. Ambiguity & Conflict Handling

If the retrieval finds **contradictory rules** (e.g., an OAP suggesting one height and a PLU Article mandating another):
1.  The system prioritizes the higher `source_authority`.
2.  If authorities are equal, it flags a **"Regulatory Conflict"** in the `EvidenceBundle` and recommends manual expert review.
