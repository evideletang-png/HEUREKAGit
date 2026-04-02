import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const KeywordInferenceSchema = z.object({
  mappings: z.array(z.object({
    category: z.string(), // e.g. "Emprise au sol", "Hauteur", "Stationnement"
    suggestedKeywords: z.array(z.string()),
    confidence: z.number(),
    reasoning: z.string()
  }))
});

/**
 * Onboarding Utility: Inferred keywords from a sample PLU.
 * Assists the Mairie in setting up their automated extraction keywords.
 */
export async function inferPLUKeywords(pluText: string): Promise<z.infer<typeof KeywordInferenceSchema>> {
  const systemPrompt = `Tu es l'Expert-Configurateur HEUREKA. Ton rôle est de LIRE un extrait de règlement PLU et d'IDENTIFIER les mots-clés sémantiques utilisés par cette commune pour désigner les articles réglementaires majeurs.
  
  Catégories cibles :
  1. Emprise au sol (CES, emprise, etc.)
  2. Hauteur des constructions (égout, faîtage, acrotère, m)
  3. Implantation / Retrait (limites séparatives, alignement, recul)
  4. Stationnement (places, vélos, VL)
  5. Espaces Verts (pleine terre, plantations)
  6. Aspect Architectural (façades, toitures, matériaux)
  7. Clôtures (murs, portails, haies)

  Pour chaque catégorie, suggère les 3-5 mots-clés les plus discriminants trouvés dans le texte.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Texte du PLU (extrait représentatif) :\n\n${pluText.substring(0, 50000)}` }
      ],
      response_format: zodResponseFormat(KeywordInferenceSchema, "keyword_inference"),
      temperature: 0,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{"mappings": []}');
    return result;
  } catch (err) {
    console.error("[MairieOnboarding] Keyword inference failed:", err);
    return { mappings: [] };
  }
}
