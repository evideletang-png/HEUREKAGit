# Implementation Plan - Phase 11: Per-Document Analysis & Localized Comments

L'objectif est de permettre à la mairie de consulter chaque document d'un dossier individuellement, d'avoir une analyse (conformité/vigilance) séparée par document, et de pouvoir lier des commentaires à un document spécifique.

## User Review Required

> [!IMPORTANT]
> Cette modification change la structure des dépôts : chaque fichier envoyé par un citoyen créera désormais son propre enregistrement d'analyse. Un "Dossier" deviendra un regroupement de ces analyses.

## Proposed Changes

### 1. Base de données
- **Table `document_reviews`** :
  - Ajouter `dossier_id` (UUID) pour grouper les documents d'un même dépôt.
  - S'assurer que chaque document a son propre `extracted_data_json` et `comparison_result_json`.
- **Table `dossier_messages`** :
  - Ajouter `document_id` (UUID, optionnel) pour lier un message à un document spécifique.

### 2. Backend (API)
- **`POST /api/documents/upload`** : 
  - Modifier pour créer un enregistrement `document_review` DISTINCT par fichier.
  - Générer un `dossier_id` unique pour l'ensemble du lot.
  - Lancer l'analyse IA de façon asynchrone pour chaque document.
- **`GET /api/mairie/dossiers`** :
  - Grouper les résultats par `dossier_id` pour conserver une vue "Dossier" dans la liste principale.
- **`GET /api/documents/:id`** :
  - Retourner les informations du document spécifique ainsi que la liste des autres documents du même `dossier_id`.

### 3. Frontend Mairie (`/portail-mairie`)
- **Dossier Detail** :
  - Ajouter une barre latérale ou un onglet pour naviguer entre les documents du dossier (PC, Plan de masse, etc.).
  - Afficher l'analyse (Points de conformité/vigilance) filtrée pour le document sélectionné.
- **Messagerie** :
  - Permettre de filtrer les messages par document ou d'envoyer un message lié au document actif.

### 4. Phase 12: Synthèse Globale & Interface par Onglets
- **Backend** :
  - Créer un endpoint `GET /api/mairie/dossiers/:id/summary` qui concatène les extractions de tous les documents et génère une synthèse globale via GPT-4o.
- **Frontend** :
  - Transformer la sélection latérale en système d'onglets (Tabs) horizontaux.
  - Ajouter un onglet "Synthèse Globale" (par défaut à l'ouverture du dossier).
  - Chaque onglet de fichier affiche son analyse propre (Conformité, Vision des croquis).

## Vision et Tableaux (IA)
> [!TIP]
> L'analyse actuelle via GPT-4o supporte l'extraction de tableaux (depuis le texte extrait). Pour les **croquis et plans visuels**, nous allons passer les documents en mode Vision (image/base64) lors de l'analyse pour permettre à l'IA de "voir" les dimensions et annotations graphiques.

## Verification Plan

### Automated Tests
- Test API de génération de synthèse globale (vérifier que l'IA combine les données du CERFA et des plans).
- Vérification que l'OCR/Vision est activé pour les fichiers de type image/plan.

### Manual Verification
- Ouvrir un dossier "Extension Nogent" et vérifier la présence des onglets avec les noms de fichiers.
- Vérifier que l'onglet "Synthèse Globale" affiche un résumé cohérent de l'ensemble du projet.
- Confirmer que les tableaux de surfaces sont correctement extraits et analysés.
