import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(",")
    : true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[API Server] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check (used by Railway)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serve built frontend (co-hosted deployment)
const frontendDist = path.resolve(__dirname, "../../web/dist/public");

// Temporary debug — visit /api/debug/frontend to see what files are on disk
app.get("/api/debug/frontend", (_req, res) => {
  import("fs").then((fs) => {
    const exists = fs.existsSync(frontendDist);
    const files = exists ? fs.readdirSync(frontendDist) : [];
    const assetsDir = path.join(frontendDist, "assets");
    const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).slice(0, 20) : [];
    const indexHtml = (exists && files.includes("index.html"))
      ? fs.readFileSync(path.join(frontendDist, "index.html"), "utf-8")
      : "(not found)";
    res.json({ frontendDist, exists, files, assets, indexHtml });
  });
});

app.use("/api", router);

// Hashed assets (JS/CSS) → long-lived cache; index.html → no cache (prevents blank screen after deploy)
app.use(express.static(frontendDist, {
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
    }
  },
}));
// SPA fallback — serve index.html for all non-API routes
app.use((_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Global error handler — always returns JSON so the frontend never gets HTML errors
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[GlobalErrorHandler] ${req.method} ${req.url}`, err);
  let status = err.status || err.statusCode || 500;
  let message = err.message || "Une erreur inattendue s'est produite.";

  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "Le fichier est trop volumineux. La limite est de 100 Mo.";
  }

  if (!res.headersSent) {
    res.status(status).json({ error: err.code || "INTERNAL_ERROR", message });
  }
});

export default app;
