/**
 * Simple Retry Utility with Exponential Backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; delayMs: number } = { maxRetries: 3, delayMs: 1000 }
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === options.maxRetries) break;
      
      const wait = options.delayMs * Math.pow(2, i);
      console.warn(`[Retry] Attempt ${i + 1} failed. Retrying in ${wait}ms...`, err instanceof Error ? err.message : err);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  
  throw lastError;
}
