import { existsSync } from "node:fs";
import { join } from "node:path";

const DOTENV_PATH = join(process.cwd(), ".env");

if (existsSync(DOTENV_PATH)) {
  process.loadEnvFile?.(DOTENV_PATH);
}

export const GATEWAY_URL = readStringEnv(process.env.GATEWAY_URL, "ws://127.0.0.1:18789");

export const READONLY_MODE = process.env.READONLY_MODE !== "false";
export const APPROVAL_ACTIONS_ENABLED = process.env.APPROVAL_ACTIONS_ENABLED === "true";
export const APPROVAL_ACTIONS_DRY_RUN = process.env.APPROVAL_ACTIONS_DRY_RUN !== "false";
export const IMPORT_MUTATION_ENABLED = process.env.IMPORT_MUTATION_ENABLED === "true";
export const IMPORT_MUTATION_DRY_RUN = process.env.IMPORT_MUTATION_DRY_RUN === "true";
export const LOCAL_TOKEN_AUTH_REQUIRED = process.env.LOCAL_TOKEN_AUTH_REQUIRED !== "false";
export const LOCAL_API_TOKEN = (process.env.LOCAL_API_TOKEN ?? "").trim();
export const LOCAL_TOKEN_HEADER = "x-local-token" as const;
export const TASK_HEARTBEAT_ENABLED = process.env.TASK_HEARTBEAT_ENABLED !== "false";
export const TASK_HEARTBEAT_DRY_RUN = process.env.TASK_HEARTBEAT_DRY_RUN !== "false";
export const TASK_HEARTBEAT_MAX_TASKS_PER_RUN = parsePositiveInt(
  process.env.TASK_HEARTBEAT_MAX_TASKS_PER_RUN,
  3,
);

/**
 * Polling intervals configuration (milliseconds).
 * Can be overridden via environment variables:
 *   - POLLING_INTERVAL_SESSIONS_LIST_MS
 *   - POLLING_INTERVAL_SESSION_STATUS_MS
 *   - POLLING_INTERVAL_CRON_MS
 *   - POLLING_INTERVAL_APPROVALS_MS
 *   - POLLING_INTERVAL_CANVAS_MS
 *
 * When using the cached adapter (ADAPTER_TYPE=cached), these intervals
 * work together with CACHE_TTL_MS to determine effective query frequency.
 */
export const POLLING_INTERVALS_MS = {
  sessionsList: parsePositiveInt(process.env.POLLING_INTERVAL_SESSIONS_LIST_MS, 10000),
  sessionStatus: parsePositiveInt(process.env.POLLING_INTERVAL_SESSION_STATUS_MS, 2000),
  cron: parsePositiveInt(process.env.POLLING_INTERVAL_CRON_MS, 10000),
  approvals: parsePositiveInt(process.env.POLLING_INTERVAL_APPROVALS_MS, 2000),
  canvas: parsePositiveInt(process.env.POLLING_INTERVAL_CANVAS_MS, 5000),
} as const;

export type PollingTarget = keyof typeof POLLING_INTERVALS_MS;

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readStringEnv(input: string | undefined, fallback: string): string {
  const value = (input ?? "").trim();
  return value === "" ? fallback : value;
}
