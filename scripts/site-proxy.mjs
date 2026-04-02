import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 5173;

// Serve from the built Vite bundle
const STATIC_DIR = path.join(__dirname, "..", "artifacts", "heureka", "dist", "public");

// Proxy /api requests to the backend (must be before static)
app.use(createProxyMiddleware({
  pathFilter: '/api',
  target: 'http://127.0.0.1:8080',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    console.log(`[Proxy] ${req.method} ${req.url} → backend`);
  },
  onProxyRes: (proxyRes, req) => {
    console.log(`[Proxy] ${proxyRes.statusCode} ← ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`[Proxy] Error:`, err.message);
    if (!res.headersSent) res.status(502).json({ error: "Proxy error", message: err.message });
  }
}));

// Serve static built files
app.use(express.static(STATIC_DIR));

// SPA fallback — serve index.html for any non-asset route so React Router works
app.use((req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend not built. Run: cd artifacts/heureka && pnpm build");
  }
});

app.listen(PORT, () => {
  console.log(`Site proxy running on http://localhost:${PORT}`);
  console.log(`Serving static files from: ${STATIC_DIR}`);
  console.log(`Proxying /api to http://localhost:8080`);
});
