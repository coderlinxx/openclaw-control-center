import { OpenClawLiveClient } from "./openclaw-live-client";
import { OpenClawCachedClient } from "./openclaw-cached-client";
import type { ToolClient } from "./tool-client";

/**
 * Create a ToolClient instance based on environment configuration.
 *
 * ADAPTER_TYPE environment variable (default: "cached"):
 *   - "cached": OpenClawCachedClient wrapping OpenClawLiveClient (recommended for resource-constrained environments)
 *   - "live": OpenClawLiveClient directly (no caching, frequent CLI spawn)
 *
 * CACHE_TTL_MS environment variable (default: 86400000 = 24 hours):
 *   - Custom cache time-to-live in milliseconds (only used with "cached" adapter)
 */
export function createToolClient(): ToolClient {
  const adapterType = (process.env.ADAPTER_TYPE ?? "cached").toLowerCase().trim();

  if (adapterType === "live") {
    return new OpenClawLiveClient();
  }

  // Default: use cached adapter for better performance
  return new OpenClawCachedClient();
}
