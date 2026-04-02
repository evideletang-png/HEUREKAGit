# Migration Decisions - HEUREKA Consolidation

This document records the architectural and structural decisions made during the consolidation of the HEUREKA project on April 1, 2026.

## 1. Canonical Base Selection: Web-SaaS-Builder
- **Decision**: `Web-SaaS-Builder` was selected as the canonical technical base for HEUREKA.
- **Rationale**: It contains a mature, production-ready stack (Vite/React/Express/pnpm/PostgreSQL) and provides a superior user experience (React-based interactive dashboards) compared to the root static prototype.
- **Outcome**: Its internal apps were moved to `apps/web` and `apps/api` respectively.

## 2. Archiving the Legacy Prototype
- **Decision**: Root static files (`index.html`, `login.html`, `register.html`, `styles.css`) were archived in `archive/legacy-prototype/`.
- **Rationale**: To prevent confusion and ensure a single source of truth for the application's entrypoint. The React application (`apps/web`) already provides equivalent and enhanced versions of these screens.
- **Outcome**: The root now only contains workspace orchestration and the unified app structure.

## 3. Separation of Parcel Analysis Service
- **Decision**: `parcel-selector-api` was preserved as a standalone service in `services/parcel-analysis/`.
- **Rationale**: The service is domain-coherent and highly specialized in geospatial analysis. Keeping it separate initially reduces migration risk and allows for independent testing and scaling.
- **Outcome**: It will be integrated with `apps/api` via internal API calls.

## 4. Maintenance of Root Infrastructure
- **Decision**: Root-level orchestration (Docker, Compose, pnpm workspace) was kept at the top level.
- **Rationale**: This is standard practice for monorepos, providing clear visibility into the entire project's dependencies and deployment model.
- **Outcome**: `Dockerfile` and `docker-compose.yml` now manage the orchestration of the unified multi-app structure.

## 5. Intentional Omissions
- **Decision**: Legacy log files and redundant database check scripts were not migrated into the `apps/` folders unless strictly necessary.
- **Rationale**: To maintain a clean, developer-friendly codebase.
