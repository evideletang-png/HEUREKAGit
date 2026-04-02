# Migration Plan - HEUREKA Consolidation

This document describes the phases of HEUREKA's consolidation on April 1, 2026.

## Phase 1: Audit & Discovery
- **Actions**: Identified existing codebases, evaluated `Web-SaaS-Builder` maturity vs. root static prototype.
- **Result**: `Web-SaaS-Builder` selected as canonical base.

## Phase 2: Preparation & Preparation
- **Actions**: Created `archive/` directory, moved root static files to `archive/legacy-prototype/` to clear the workspace.

## Phase 3: Monorepo Restructuring
- **Actions**: Implementation of `pnpm` workspaces.
- **Details**:
    - Created `apps/web` and `apps/api`.
    - Created `services/parcel-analysis`.
    - Integrated `packages/` from legacy `lib/` and `artifacts/lib/`.
    - Updated `pnpm-workspace.yaml`.

## Phase 4: Integration
- **Actions**: Unified root infrastructure (`Dockerfile`, `docker-compose.yml`, `package.json`).
- **Result**: Unified orchestration of the entire platform.

## Phase 5: Messaging & UX Alignment
- **Actions**: Updated React app messaging to reflect the civic-tech mission (citizens and municipalities).
- **Result**: Removed land-speculation oriented copy in favor of institutional trust.

## Future Steps (Next Priorities)
- **1. pnpm link verification**: Ensure all workspace packages are correctly linked after restructuring.
- **2. Docker validation**: Build and test the unified container orchestration.
- **3. API unification**: Move geospatial logic from `services/parcel-analysis` into a shared `packages/geo` if inter-service latency becomes an issue.
