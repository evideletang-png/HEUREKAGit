/**
 * API URL helper — returns base URL for API calls.
 * In dev, uses the API server at port 8080 via the Replit proxy.
 * In production, uses relative path (same origin).
 */
export function getApiUrl(): string {
  if (import.meta.env.DEV) {
    // In dev, the API server runs on port 8080, accessible via Replit proxy
    const devDomain = import.meta.env.VITE_API_URL || "";
    if (devDomain) return devDomain;
    // Fallback: use window location but swap port isn't possible in Replit proxy
    // So we use empty string and let the existing fetch configuration handle it
    return "";
  }
  return "";
}
