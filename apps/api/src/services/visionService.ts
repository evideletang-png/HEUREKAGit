import { OpenAI } from "openai";
import fs from "fs";
import path from "path";

// Soft fail for pdf-img-convert (disabled due to missing native 'canvas' dependencies)
const pdf2img: any = null;

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

export class VisionService {
    /**
     * Analyse un document (PDF ou Image) via GPT-4o Vision
     * @param filePath Chemin local du fichier (PDF ou Image)
     * @returns Description textuelle de l'analyse visuelle
     */
    static async analyzePlan(filePath: string): Promise<string> {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let base64Images: string[] = [];

            if (ext === ".pdf") {
                console.log(`[Vision] Converting PDF to images: ${filePath}`);
                if (!pdf2img) {
                    throw new Error("La conversion PDF en Image est désactivée sur ce serveur (dépendance 'canvas' manquante). Veuillez fournir une image directe pour l'analyse vision.");
                }
                const pdfArray = await pdf2img.convert(filePath, { 
                    width: 1200, // Bonne résolution pour les plans
                    page_numbers: [1, 2] // On limite aux 2 premières pages (souvent les plans de situation/masse)
                });
                base64Images = pdfArray.map((img: any) => Buffer.from(img).toString('base64'));
            } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
                const buffer = fs.readFileSync(filePath);
                base64Images = [buffer.toString('base64')];
            } else {
                throw new Error("Format de fichier non supporté pour la vision: " + ext);
            }

            if (base64Images.length === 0) {
                throw new Error("Aucune image extraite du document.");
            }

            console.log(`[Vision] Sending ${base64Images.length} images to GPT-4o...`);

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Tu es un expert en urbanisme et en lecture de plans de permis de construire (PCMI). 
                        Ton rôle est d'extraire les informations graphiques essentielles des plans fournis (plan de masse, plan de situation, façades).
                        
                        Concentre-toi sur :
                        1. L'emprise au sol projetée (m2).
                        2. Les hauteurs (faîtage et égout du toit).
                        3. Les espaces verts / pleine terre (m2 ou %).
                        4. La distance par rapport aux limites séparatives (m).
                        5. Les incohérences manifestes entre le texte (déclaratif) et le dessin.
                        
                        Réponds en français de manière structurée et technique.`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analyse visuellement ces plans d'urbanisme et fournis une synthèse des métriques clés." },
                            ...base64Images.map(b64 => ({
                                type: "image_url" as const,
                                image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" as const }
                            }))
                        ],
                    },
                ],
                max_tokens: 1500,
            });

            return response.choices[0]?.message?.content || "Aucun résultat vision généré.";
        } catch (err) {
            console.error("[VisionService] Error during analysis:", err);
            throw err;
        }
    }
}
