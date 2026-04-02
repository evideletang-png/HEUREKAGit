# Repository Map - HEUREKA

This map provides a guide for developers joining the project.

## Root Directory
- `apps/`: Main applications.
- `services/`: Specialized microservices.
- `packages/`: Shared libraries and integrations.
- `docs/`: Product and technical documentation.
- `planning/`: Implementation plans and roadmaps.
- `archive/`: Legacy files and prototypes.
- `scripts/`: Development and utility scripts.
- `attached_assets/`: Static assets (images, PDFs) used by the apps.
- `Dockerfile` & `docker-compose.yml`: Root orchestration.

## Apps
- `apps/web/`: React frontend (Vite).
    - `src/pages/`: Unified portals (citizen, mairie, admin).
    - `src/components/`: UI components and layouts.
    - `src/hooks/`: Analytics and auth hooks.
- `apps/api/`: Express API server.
    - `src/routes/`: Zod-validated endpoints.
    - `src/services/`: Business logic and external integrations.

## Services
- `services/parcel-analysis/`: Express service for geospatial logic.
    - `index.js`: Main API entrypoint.
    - `src/geo/`: Geometric algorithms (Bbox, filtering).

## Packages
- `packages/db/`: Global Drizzle schema and DB access.
- `packages/api-zod/`: Shared Zod schemas for request/response validation.
- `packages/api-client-react/`: React Query infrastructure for the web app.
- `packages/integrations/`: Third-party integration SDKs (OpenAI, etc.).
