# Multi-stage Docker build pour l'application Heureka
FROM node:20-alpine AS builder

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copie des fichiers racine
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copie des dépendances locales (les packages partagés)
COPY lib/db ./lib/db
COPY lib/integrations/openai/ai-server ./lib/integrations/openai/ai-server
COPY lib/integrations/zod/api-zod ./lib/integrations/zod/api-zod

# Copie du backend et du frontend
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/heureka ./artifacts/heureka

# Installation de toutes les dépendances du workspace
RUN pnpm install --frozen-lockfile

# Build du Frontend (Heureka Vite App)
WORKDIR /app/artifacts/heureka
RUN npm run build

# Préparation du Backend
WORKDIR /app/artifacts/api-server
# Le package.json doit être accessible pour tsx ou la compilation
# Nous utilisons tsx pour exécuter directement le backend en mode TS

# Etape finale : Run Environment
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copie depuis le builder
COPY --from=builder /app /app

# Lancement du serveur backend qui sert aussi les fichiers statiques du frontend via son script index.ts (le cas échéant), 
# ou on peut lancer explicitement pnpm tsx
WORKDIR /app/artifacts/api-server

# Exposition du port
EXPOSE 8080

# Démarrage
CMD ["pnpm", "tsx", "src/index.ts"]
