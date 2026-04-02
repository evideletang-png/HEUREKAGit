import { db, townHallDocumentsTable } from "../../../lib/db/src/index.ts";

const stCyrPluText = `
RÈGLEMENT DU PLAN LOCAL D'URBANISME DE SAINT-CYR-SUR-LOIRE

DISPOSITIONS COMMUNES À TOUTES LES ZONES
... (Omitted for brevity) ...

SECTION II - ZONE UB (Secteur urbain mixte)

UB-ARTICLE 1 : OCCUPATIONS OU UTILISATIONS DU SOL INTERDITES
Sont interdites toutes les occupations ou utilisations des sols non compatibles avec les caractères propres à la zone.
Sont notamment interdits :
- Les établissements, installations ou utilisations du sol qui, par leur destination, leur nature, leur importance ou leur aspect sont incompatibles avec la salubrité, la tranquillité, la sécurité ou l'environnement d'un quartier d'habitation...
- Les constructions à destination industrielle et d'entrepôt.

UB-ARTICLE 6 : IMPLANTATION DES CONSTRUCTIONS PAR RAPPORT AUX VOIES ET EMPRISES PUBLIQUES
Les constructions doivent être implantées avec un recul minimal de 5 mètres par rapport à l'alignement ou à la limite des emprises publiques.

UB-ARTICLE 7 : IMPLANTATION DES CONSTRUCTIONS PAR RAPPORT AUX LIMITES SÉPARATIVES
La distance D comptée horizontalement de tout point de la construction à la limite séparative doit être au moins égale à la moitié de la hauteur H de la construction (D ≥ H/2), sans pouvoir être inférieure à 3 mètres.

UB-ARTICLE 9 : EMPRISE AU SOL DES CONSTRUCTIONS
L'emprise au sol des constructions est limitée comme suit pour les secteurs UBa, UBb, UBc :
- Pour les constructions de moins de 3 logements :
    * 20% si la superficie du terrain est inférieure à 700 m².
    * 30% si la superficie du terrain est égale ou supérieure à 700 m².
- Pour les constructions de 3 logements ou plus :
    * 20% si la superficie du terrain est inférieure à 700 m².
    * 25% si la superficie du terrain est égale ou supérieure à 700 m².

UB-ARTICLE 10 : HAUTEUR MAXIMALE DES CONSTRUCTIONS
Dans les secteurs UBa, UBb et UBc :
La hauteur maximale des constructions est fixée à 8 mètres (ce qui correspond généralement à un rez-de-chaussée + 1 étage ou combles).
Dans le secteur UB strict :
La hauteur maximale est fixée à 11 mètres (R+2).

UB-ARTICLE 12 : OBLIGATIONS IMPOSÉES EN MATIÈRE DE STATIONNEMENT
Pour les constructions à usage d'habitation : 2 places par logement sont exigées.

UB-ARTICLE 13 : ESPACES LIBRES ET PLANTATIONS
Une part minimale de la superficie du terrain doit être maintenue en espaces verts ou pleine terre :
- Secteurs UBa, UBb : 15% à 30% selon le type de projet.
`;

async function main() {
  console.log("Starting Saint-Cyr-sur-Loire PLU insertion...");
  const userId = "0a9809d3-042e-417f-bd87-eee7653baeff";
  try {
    console.log("Connecting to database and inserting...");
    const result = await db.insert(townHallDocumentsTable).values({
      id: "37540-plu-ubb-" + Date.now(),
      userId,
      commune: "Saint-Cyr-sur-Loire",
      title: "Règlement PLU Officiel (Zone UB/UBb)",
      fileName: "saint-cyr-plu.pdf",
      rawText: stCyrPluText,
    });
    console.log("Insertion successful:", result);
  } catch (err) {
    console.error("FATAL ERROR during insertion:");
    console.error(err);
    process.exit(1);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
