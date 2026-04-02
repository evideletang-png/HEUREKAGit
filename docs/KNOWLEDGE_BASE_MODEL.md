# HEUREKA Knowledge Base Model

To ensure legally sound urbanism analysis, HEUREKA utilizes a standardized, rich metadata model to tag all document fragments (embeddings).

## 1. Metadata Schema (`KnowledgeMetadataSchema`)

Defined in `@workspace/ai-core`, this schema is used during both ingestion and retrieval.

| Field | Type | Description |
| :--- | :--- | :--- |
| `document_id` | UUID | Link to the parent document record. |
| `document_type` | Enum | `plu_reglement`, `plu_annexe`, `oap`, `cerfa`, etc. |
| `commune` | String | INSEE code or Commune name for top-level search. |
| `zone` | String | (Optional) Urbanism zone, e.g., `UA`, `UAa`, `N`. |
| `article_id` | String | (Optional) Exact article number, e.g., `10`, `12`. |
| `section_title`| String | (Optional) Title of the chapter/section for context. |
| `source_authority`| Number | (1-10) Legal weight according to the [Authority Policy](file:///Users/evideletang/Desktop/HEUREKA/docs/EVIDENCE_RANKING.md). |
| `version_date` | String | ISO date for version conflict resolution. |

### Example Metadata (Indexed Chunk)
```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "document_type": "plu_reglement",
  "commune": "Nogent-sur-Marne",
  "zone": "UA",
  "article_id": "10",
  "source_authority": 9,
  "topic_tags": ["Hauteur", "Faitage", "Acrotère"]
}
```

## 2. Evidence Grounding (`EvidenceBundle`)

Retrieved chunks are grouped into **EvidenceBundles**. These structures provide the AI reasoning engine with a "faisceau de preuves" (bundle of evidence) for each compliance point.

- **Authoritative Rule**: The primary chunk from the PLU (Authority >= 9).
- **Support Chunks**: Related context from OAPs or Annexes.
- **Project Mentions**: Specific facts extracted from the CERFA or Notice.

## 3. Storage Hierarchy

- **Level 1 (SQL Filters)**: `municipality_id`, `doc_type`, `zone`. Fast, exact filtering.
- **Level 2 (Semantic Filters)**: Similarity + Authority Scoring. Precision ranking.
- **Level 3 (Grounding Boost)**: Exact `article_id` matching ensures perfect retrieval.
