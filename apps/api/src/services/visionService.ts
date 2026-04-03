import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

/**
 * Convert up to `maxPages` pages of a PDF to base64 PNG images using pdftoppm
 * (from poppler-utils, available on the production Docker image).
 * Returns an empty array if pdftoppm is not installed.
 */
function pdfToBase64Images(filePath: string, maxPages = 5): string[] {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vision_"));
    const prefix = path.join(tmpDir, "page");
    try {
        // -r 150: 150 dpi — good balance of quality vs token size
        // -l {maxPages}: stop after maxPages
        // -png: output PNG
        execSync(`pdftoppm -r 150 -png -l ${maxPages} "${filePath}" "${prefix}"`, {
            timeout: 60000,
            stdio: "pipe",
        });
        const files = fs.readdirSync(tmpDir)
            .filter(f => f.endsWith(".png"))
            .sort()
            .slice(0, maxPages);
        return files.map(f => fs.readFileSync(path.join(tmpDir, f)).toString("base64"));
    } catch (err: any) {
        // pdftoppm not installed or failed — log and return empty
        console.warn("[VisionService] pdftoppm failed:", err.message || err);
        return [];
    } finally {
        // Clean up tmp files
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
    }
}

export class VisionService {
    /**
     * Analyse un document (PDF ou Image) via GPT-4o Vision.
     * PDF conversion uses pdftoppm (poppler-utils) — no native canvas needed.
     */
    static async analyzePlan(filePath: string): Promise<string> {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let base64Images: string[] = [];

            if (ext === ".pdf") {
                console.log(`[Vision] Converting PDF to images via pdftoppm: ${filePath}`);
                base64Images = pdfToBase64Images(filePath, 5);
                if (base64Images.length === 0) {
                    throw new Error("pdftoppm n'est pas disponible sur ce serveur ou n'a produit aucune image. Fournissez une image directe pour l'analyse Vision.");
                }
            } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
                const buffer = fs.readFileSync(filePath);
                base64Images = [buffer.toString("base64")];
            } else {
                throw new Error("Format de fichier non supporté pour la vision: " + ext);
            }

            if (base64Images.length === 0) {
                throw new Error("Aucune image extraite du document.");
            }

            console.log(`[Vision] Sending ${base64Images.length} image(s) to GPT-4o...`);

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

                        Réponds en français de manière structurée et technique.`,
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analyse visuellement ces plans d'urbanisme et fournis une synthèse des métriques clés." },
                            ...base64Images.map(b64 => ({
                                type: "image_url" as const,
                                image_url: { url: `data:image/png;base64,${b64}`, detail: "high" as const },
                            })),
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

    /**
     * Extract raw text from a PDF using GPT-4o Vision (for scanned/image-only PDFs).
     * Falls back to empty string if pdftoppm is unavailable.
     */
    static async extractTextFromScannedPDF(filePath: string, maxPages = 3): Promise<string> {
        const base64Images = pdfToBase64Images(filePath, maxPages);
        if (base64Images.length === 0) return "";

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Tu es un OCR expert. Extrais intégralement le texte visible dans les images fournies, en conservant la structure (articles, alinéas, numéros). Ne résume pas, reproduis le texte tel quel.",
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrais le texte intégral de ces pages." },
                            ...base64Images.map(b64 => ({
                                type: "image_url" as const,
                                image_url: { url: `data:image/png;base64,${b64}`, detail: "high" as const },
                            })),
                        ],
                    },
                ],
                max_tokens: 4096,
            });

            return response.choices[0]?.message?.content || "";
        } catch (err) {
            console.error("[VisionService] OCR extraction failed:", err);
            return "";
        }
    }
}
