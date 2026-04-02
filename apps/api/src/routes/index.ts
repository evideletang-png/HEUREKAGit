import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import analysesRouter from "./analyses.js";
import adminRouter from "./admin.js";
import geocodeRouter from "./geocode.js";
import chatRouter from "./chat.js";
import documentsRouter from "./documents.js";
import mairieRouter from "./mairie.js";
import dossiersRouter from "./dossiers.js";

import notificationsRouter from "./notifications.js";

const router: IRouter = Router();

router.use("/notifications", notificationsRouter);
router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/analyses", analysesRouter);
router.use("/analyses", chatRouter);
router.use("/admin", adminRouter);
router.use("/geocode", geocodeRouter);
router.use("/documents", documentsRouter);
router.use("/mairie", mairieRouter);
router.use("/dossiers", dossiersRouter);

export default router;
