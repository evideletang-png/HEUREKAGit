# Guide d'Intégration HEUREKA Engine

Bienvenue dans le guide d'intégration de l'API HEUREKA. Ce document vous explique comment utiliser notre moteur de décision pour automatiser l'analyse réglementaire de vos dossiers d'urbanisme.

## 1. Concepts Clés

- **Dossier** : Un ensemble de documents (plans, CERFA) identifiés par un ID unique.
- **Moteur Déterministe** : Les calculs de seuils (hauteur, emprise) sont garantis sans hallucination.
- **Idempotence** : Plusieurs appels pour un même dossier retourneront le même résultat de manière instantanée.

## 2. API Reference

### Lancer une Analyse
`POST /decision-engine/run`

**Request Body**
```json
{
  "dossierId": "uuid-1234",
  "commune": "Montigny-le-Bretonneux",
  "forceReanalysis": false
}
```

**Response Body (Standardized)**
```json
{
  "dossierId": "uuid-1234",
  "status": "completed",
  "globalScore": 85,
  "businessDecision": {
    "decision": "favorable_avec_reserves",
    "score": 85,
    "justification": "Le projet est conforme globalement mais nécessite des ajustements sur l'article 6.",
    "blockingPoints": [],
    "requiredActions": ["Ajuster le retrait de 0.5m sur la façade Nord"],
    "engineVersion": "1.0.0-stable",
    "requestId": "req-987",
    "timestamp": "2024-03-23T18:00:00Z"
  },
  "metrics": {
    "executionTimeMs": 1240,
    "tokenUsage": 4500,
    "estimatedCostUsd": 0.015
  }
}
```

## 3. Gestion des Erreurs

| Code | Description | Solution |
|---|---|---|
| `MISSING_REQUIRED_FIELDS` | dossierId ou commune manquant. | Vérifiez votre payload JSON. |
| `ENGINE_EXECUTION_FAILED` | Erreur interne du moteur. | Réessayez plus tard ou vérifiez les documents. |

## 4. Exportation des Résultats

Une fois l'analyse terminée, vous pouvez utiliser le `ExportService` interne pour générer des rapports PDF ou HTML basés sur l'objet `BusinessDecision` retourné.

---

HEUREKA v1.0.0-stable | Support: developer@heureka-saas.com
