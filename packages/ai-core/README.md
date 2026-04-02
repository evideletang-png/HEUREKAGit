# @workspace/ai-core

Centralized AI logic, schemas, and prompts for the HEUREKA platform.

## Architecture

- `src/schemas/`: Zod definitions for all AI I/O.
- `src/prompts/`: Modular, versioned prompt library.
- `src/regression.test.ts`: Fixture-driven regression suite.

## Development Workflow

### 1. Modifying Schemas
If you update an AI output structure, ensure you:
1. Update the corresponding Zod schema in `src/schemas/`.
2. Update the regression fixtures in `fixtures/` to match.
3. Run the regression suite to ensure backward compatibility.

### 2. Adding Prompts
New prompts should be added to the `SYSTEM_PROMPTS` object in `src/prompts/index.ts`. Avoid hardcoding prompts in service files.

### 3. Running Regressions
To verify that AI logic hasn't drifted or broken existing schemas:
```bash
pnpm --filter @workspace/ai-core run tsx src/regression.test.ts
```

## Schema Versioning Strategy

HEUREKA uses a "Soft Versioning" approach for AI records:
1. **Validation Layer**: All AI outputs are validated against the current schema before being stored.
2. **Metadata Versioning**: Every AI record in the database should ideally include a `schema_version` (e.g., `2.1.0`).
3. **Frontend Resilience**: The UI (`normalizeComparison` functions) must gracefully handle missing optional fields from legacy records.
4. **Breaking Changes**: If a schema change is non-backward compatible, a database migration to update legacy JSON blobs is required.

## Regression Fixtures
Located in `fixtures/`, these JSON files represent ground-truth scenarios:
- `ideal.json`: Successful extraction/interpretation.
- `ambiguous.json`/`uncertain.json`: Scenarios triggering the "Cannot Conclude" UX path.
