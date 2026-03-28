import type {
  ApprovalsActionResponse,
  ApprovalsApproveRequest,
  ApprovalsGetResponse,
  ApprovalsRejectRequest,
  CronListResponse,
  SessionStatusResponse,
  SessionsHistoryRequest,
  SessionsHistoryResponse,
  SessionsListResponse,
} from "../contracts/openclaw-tools";
import { APPROVAL_ACTIONS_ENABLED } from "../config";
import { OpenClawLiveClient } from "./openclaw-live-client";
import type { ToolClient } from "./tool-client";

/**
 * Cache TTL configuration (milliseconds)
 * Default: 24 hours to avoid frequent CLI spawn on small machines
 * Can be overridden via CACHE_TTL_MS environment variable
 */
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Cached wrapper around OpenClawLiveClient.
 * Reduces CLI spawn frequency by caching results for 24 hours.
 * Significantly improves performance on resource-constrained machines.
 */
export class OpenClawCachedClient implements ToolClient {
  private delegate: ToolClient;
  private cacheTtlMs: number;

  private sessionsListCache?: CacheEntry<SessionsListResponse>;
  private cronListCache?: CacheEntry<CronListResponse>;
  private approvalsGetCache?: CacheEntry<ApprovalsGetResponse>;
  private sessionStatusCache = new Map<string, CacheEntry<SessionStatusResponse>>();
  private sessionsHistoryCache = new Map<string, CacheEntry<SessionsHistoryResponse>>();

  constructor(delegate: ToolClient = new OpenClawLiveClient()) {
    this.delegate = delegate;

    const envTtl = process.env.CACHE_TTL_MS;
    const ttl = envTtl ? Number.parseInt(envTtl, 10) : DEFAULT_CACHE_TTL_MS;
    this.cacheTtlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL_MS;
  }

  async sessionsList(): Promise<SessionsListResponse> {
    const now = Date.now();

    if (this.sessionsListCache && this.sessionsListCache.expiresAt > now) {
      return this.sessionsListCache.value;
    }

    const result = await this.delegate.sessionsList();
    this.sessionsListCache = {
      value: result,
      expiresAt: now + this.cacheTtlMs,
    };

    return result;
  }

  async sessionStatus(sessionKey: string): Promise<SessionStatusResponse> {
    const now = Date.now();
    const cached = this.sessionStatusCache.get(sessionKey);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const result = await this.delegate.sessionStatus(sessionKey);
    this.sessionStatusCache.set(sessionKey, {
      value: result,
      expiresAt: now + this.cacheTtlMs,
    });

    return result;
  }

  async sessionsHistory(request: SessionsHistoryRequest): Promise<SessionsHistoryResponse> {
    const now = Date.now();
    const cacheKey = `${request.sessionKey}:${request.limit ?? "default"}`;
    const cached = this.sessionsHistoryCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const result = await this.delegate.sessionsHistory(request);
    this.sessionsHistoryCache.set(cacheKey, {
      value: result,
      expiresAt: now + this.cacheTtlMs,
    });

    return result;
  }

  async cronList(): Promise<CronListResponse> {
    const now = Date.now();

    if (this.cronListCache && this.cronListCache.expiresAt > now) {
      return this.cronListCache.value;
    }

    const result = await this.delegate.cronList();
    this.cronListCache = {
      value: result,
      expiresAt: now + this.cacheTtlMs,
    };

    return result;
  }

  async approvalsGet(): Promise<ApprovalsGetResponse> {
    const now = Date.now();

    if (this.approvalsGetCache && this.approvalsGetCache.expiresAt > now) {
      return this.approvalsGetCache.value;
    }

    const result = await this.delegate.approvalsGet();
    this.approvalsGetCache = {
      value: result,
      expiresAt: now + this.cacheTtlMs,
    };

    return result;
  }

  async approvalsApprove(request: ApprovalsApproveRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsApprove is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }

    // Invalidate approval cache on action
    this.approvalsGetCache = undefined;
    return this.delegate.approvalsApprove(request);
  }

  async approvalsReject(request: ApprovalsRejectRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsReject is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }

    // Invalidate approval cache on action
    this.approvalsGetCache = undefined;
    return this.delegate.approvalsReject(request);
  }

  /**
   * Clear all caches forcefully.
   * Called when user manually requests fresh data (e.g., refresh button).
   * Ensures next query will hit the CLI, not the cache.
   */
  clearAllCaches(): void {
    this.sessionsListCache = undefined;
    this.cronListCache = undefined;
    this.approvalsGetCache = undefined;
    this.sessionStatusCache.clear();
    this.sessionsHistoryCache.clear();
  }
}
