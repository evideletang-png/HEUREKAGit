/**
 * Metrics Service for tracking performance and costs.
 */

export interface RequestMetrics {
  startTime: number;
  endTime?: number;
  durationMs?: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedCostUsd: number;
}

const PRICING = {
  "gpt-4o": { prompt: 2.5 / 1_000_000, completion: 10 / 1_000_000 },
  "gpt-4o-mini": { prompt: 0.15 / 1_000_000, completion: 0.6 / 1_000_000 }
};

export class MetricsTracker {
  private startTime: number;
  private tokens = { prompt: 0, completion: 0, total: 0 };

  constructor() {
    this.startTime = Date.now();
  }

  addTokens(prompt: number, completion: number) {
    this.tokens.prompt += prompt;
    this.tokens.completion += completion;
    this.tokens.total += (prompt + completion);
  }

  getMetrics(model: keyof typeof PRICING = "gpt-4o"): RequestMetrics {
    const endTime = Date.now();
    const durationMs = endTime - this.startTime;
    
    const pricing = PRICING[model] || PRICING["gpt-4o"];
    const estimatedCostUsd = (this.tokens.prompt * pricing.prompt) + (this.tokens.completion * pricing.completion);

    return {
      startTime: this.startTime,
      endTime,
      durationMs,
      tokens: { ...this.tokens },
      estimatedCostUsd
    };
  }
}

/**
 * Global helper to track cost and tokens from OpenAI responses.
 */
export function trackOpenAIUsage(tracker: MetricsTracker, response: any) {
  if (response.usage) {
    tracker.addTokens(response.usage.prompt_tokens, response.usage.completion_tokens);
  }
}
