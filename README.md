# HEUREKA: Urban Planning & PLU Conformity Platform

HEUREKA is an urban planning dossier assistance and PLU conformity platform designed for citizens and local authorities.

## Product Mission
- **Help citizens** prepare and track urban-planning dossiers.
- **Help municipalities, métropoles, and expert services** (like ABF) review and instruct dossiers.
- **Support PLU / PLUi conformity analysis** via automated geospatial checks.
- **Provide a clear, traceable workflow** for the entire urban planning process.

## Repository Structure

This project is organized as a **pnpm monorepo**.

```text
HEUREKA/
├── apps/
│   ├── web/                # React/Vite Frontend (Citizen & Mairie portals)
│   └── api/                # Express Backend (Business logic & AI integrations)
├── services/
│   └── parcel-analysis/    # Standalone Geospatial Parcel Analysis Service
├── packages/
│   ├── db/                 # Shared Database schema & Drizzle ORM
│   ├── api-client-react/   # Shared React Query hooks for API access
│   ├── api-zod/            # Shared Zod schemas for API validation
│   └── (others)            # Domain logic and integrations
├── planning/               # Product roadmaps and implementation plans
├── docs/                   # Product & Technical documentation
└── archive/
    └── legacy-prototype/   # Archived static HTML/CSS prototype
```

## Getting Started

### Prerequisites
- Node.js (v20+)
- pnpm (v10+)
- Docker & Docker Compose (for database and services)

### Installation
```bash
pnpm install
```

### Running Locally
```bash
# Start infrastructure (PostgreSQL, etc.)
docker-compose up -d

# Run all apps and services in development mode
pnpm dev
```

## Documentation
- [Product Architecture](file:///Users/evideletang/Desktop/HEUREKA/docs/PRODUCT_ARCHITECTURE.md)
- [Migration Decisions](file:///Users/evideletang/Desktop/HEUREKA/docs/MIGRATION_DECISIONS.md)
- [Repo Map](file:///Users/evideletang/Desktop/HEUREKA/docs/REPO_MAP.md)

## License
Confidential - All Rights Reserved
