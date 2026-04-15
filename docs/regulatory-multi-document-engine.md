# Moteur d'interprétation réglementaire multi-documents

## Objectif
Faire fonctionner Heuréka comme un moteur d'interprétation réglementaire prudent, multi-documents et traçable, plutôt que comme un simple extracteur de texte.

Le moteur repose désormais sur trois couches :
- une couche déterministe de structuration documentaire,
- une couche de raisonnement réglementaire multi-documents,
- une couche d'arbitrage IA qui orchestre la lecture finale.

Depuis cette refonte, le mode standard expose aussi :
- une résolution automatique `zone / sous-secteur probable`,
- des `suggestions` structurées non publiées par défaut,
- une restitution par niveaux de certitude : `certain`, `probable`, `a confirmer`,
- un mode expert relégué a la correction et non plus au flux principal.

## Modules principaux

### 1. `regulatoryDocumentClassifier.ts`
Responsabilité :
- qualifier automatiquement les documents déposés,
- détecter leur rôle documentaire,
- distinguer les pièces textuelles, graphiques, mixtes et de risques,
- repérer les premiers signaux de renvoi cross-document,
- exploiter aussi `structuredContent` pour mieux lire les légendes, secteurs, notes visuelles et métadonnées mixtes.

Sortie principale :
- `ClassifiedRegulatoryDocument`

### 2. `regulatoryIndexer.ts`
Responsabilité :
- indexer la matière réglementaire par zone,
- relier documents, segments, règles publiées, sections de zone et overlays,
- produire un index thématique et canonique par article,
- détecter un sous-secteur probable quand plusieurs sources convergent.

Sortie principale :
- `ZoneRegulatoryIndex`

### 2 bis. `zoneAndSubsectorResolver.ts`
Responsabilité :
- arbitrer la zone réellement lue dans le corpus,
- distinguer zone demandée et sous-secteur probable,
- expliciter les sources qui soutiennent cette résolution,
- remonter des alertes lorsque plusieurs sous-secteurs coexistent.

Sortie principale :
- `ZoneAndSubsectorResolution`

### 3. `graphicalRuleResolver.ts`
Responsabilité :
- détecter les dépendances aux documents graphiques,
- signaler quand une règle ne peut pas être conclue sans plan,
- qualifier la règle comme `graphical` ou `mixed`.

### 4. `riskAndOverlayResolver.ts`
Responsabilité :
- intégrer les risques, servitudes, protections patrimoniales et overlays,
- faire remonter les dispositions additionnelles ou plus contraignantes,
- produire des alertes prudentes.

### 5. `crossDocumentReasoner.ts`
Responsabilité :
- reconstruire une première lecture réglementaire thème par thème,
- croiser texte, graphique, annexes et risques,
- produire les JSON structurés de base :
  - `topic_analyses`
  - `article_summaries`
  - `suggestions`
  - `source_decisions` par thème, pour rendre explicites les sources retenues, gardées en contexte ou écartées.

Sortie principale :
- `RegulatoryEngineOutput`

### 6. `regulatoryAdjudicationService.ts`
Responsabilité :
- faire arbitrer par l'IA la lecture finale du graphe réglementaire,
- consolider les ambiguïtés,
- hiérarchiser les sources,
- fixer le niveau de confiance,
- produire une synthèse finale prudente.

Sortie principale :
- `RegulatoryAiAdjudication`

### 7. `expertZoneAnalysisService.ts`
Responsabilité :
- agréger les segments de zone,
- produire la synthèse experte persistée,
- intégrer :
  - le moteur déterministe,
  - puis l'arbitrage IA quand il est disponible.

Versions :
- `expert_zone_analysis_v1` : lecture historique
- `expert_zone_analysis_v2` : moteur multi-documents déterministe
- `expert_zone_analysis_v3` : moteur multi-documents arbitré par IA

## Flux logique

1. Les documents d'une commune sont classés.
2. Les segments thématiques et règles publiées sont rattachés à une zone.
3. Un index réglementaire multi-documents est construit.
4. Une première lecture déterministe est produite.
5. L'IA arbitre cette lecture sans inventer de valeurs.
6. Le résultat final est persisté dans `zone_analyses.structuredJson`.
7. Le chat, la vue analyse et le workspace mairie consomment tous ce même objet.

Le flux standard est volontairement prudent :
- les suggestions sont visibles,
- elles ne deviennent pas des règles publiées automatiquement,
- le workspace PDF sert d'abord a corriger/recadrer, puis a confirmer.

## Contrôle des données restituées

Chaque thème peut désormais porter une liste `source_decisions` :
- `retained_primary`
- `retained_secondary`
- `retained_graphical`
- `retained_risk`
- `discarded_context`
- `discarded_low_confidence`

L'objectif est double :
- donner une vraie lisibilité sur le chemin d'interprétation,
- éviter l'effet “boîte noire” quand l'IA arbitre entre plusieurs pièces ou renvois.

Les sorties exposent aussi des `certaintyBuckets` :
- `certain`
- `probable`
- `a confirmer`

Cela permet de distinguer immédiatement :
- ce qui est déjà exploitable,
- ce qui est plausible mais encore prudent,
- ce qui doit être revu sur plan, annexe ou dans le workspace expert.

## Garde-fous

- Une absence de règle textuelle n'implique jamais une absence de règle.
- Un renvoi documentaire déclenche une lecture complémentaire.
- Les documents graphiques sont traités comme des sources normatives lorsqu'ils le sont juridiquement.
- L'IA n'invente pas de valeur : elle arbitre un graphe déjà structuré.
- Les risques, servitudes et protections superposées doivent toujours être signalés.

## Points d'intégration

### Workspace mairie
Route :
- `apps/api/src/routes/mairie.ts`

Rôle :
- construit ou recharge la lecture experte de zone,
- expose `expertAnalysis`,
- expose les documents classifiés et les segments.

### Orchestrateur d'analyse
Service :
- `apps/api/src/services/orchestrator.ts`

Rôle :
- persiste la synthèse experte multi-documents dans `zone_analyses`,
- persiste une synthèse canonique par article dans `rule_articles`.

### Chat analyse
Route :
- `apps/api/src/routes/chat.ts`

Rôle :
- s'appuie en priorité sur la lecture experte `v3`,
- conserve une distinction entre faits, interprétation et points à confirmer.

### UI analyse
Vue :
- `apps/web/src/pages/analysis-detail.tsx`

Rôle :
- affiche la lecture experte consolidée,
- expose les thèmes, les articles, les autres pièces et l'orchestration IA.
