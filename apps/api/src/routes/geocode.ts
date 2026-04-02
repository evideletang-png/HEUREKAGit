import { Router, type IRouter } from "express";
import { geocodeAddress } from "../services/geocoding.js";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const q = req.query.q as string;
    const type = req.query.type as string;
    if (!q || q.length < 3) {
      res.json({ results: [] });
      return;
    }
    const results = await geocodeAddress(q, type);
    res.json({ results });
  } catch (err) {
    console.error("[geocode]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur de géocodage." });
  }
});

export default router;
