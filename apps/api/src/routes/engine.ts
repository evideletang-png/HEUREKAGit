import { Router } from "express";
import { runDecisionEngine } from "../services/engineSdk.js";

const router = Router();

/**
 * @route POST /decision-engine/run
 * @desc Unified entrypoint for the HEUREKA regulatory decision engine.
 */
router.post("/run", async (req, res) => {
  const { dossierId, commune, forceReanalysis } = req.body;
  const userId = (req as any).session?.userId || "system_user"; // Mock userId if no session

  if (!dossierId || !commune) {
    return res.status(400).json({ error: "MISSING_REQUIRED_FIELDS", details: "dossierId and commune are required." });
  }

  try {
    logger.info(`[API/Engine] Processing run request for dossier ${dossierId}`, { dossierId, userId });

    const result = await runDecisionEngine({
      dossierId,
      userId,
      commune,
      forceReanalysis
    });

    return res.json(result);
  } catch (err) {
    logger.error(`[API/Engine] Run failed for dossier ${dossierId}`, err, { dossierId });
    return res.status(500).json({ 
        error: "ENGINE_EXECUTION_FAILED", 
        details: err instanceof Error ? err.message : "An internal error occurred." 
    });
  }
});

// Mock logger for this file if not imported correctly
const logger = {
    info: (msg: string, ctx?: any) => console.log(`INFO: ${msg}`, ctx),
    error: (msg: string, err: any, ctx?: any) => console.error(`ERROR: ${msg}`, err, ctx)
};

export default router;
