/**
 * Writable JSON store for serverless BFF (Vercel).
 * Memory → /tmp (or .data locally) → Railway `/api/v1/ephemeral/{key}`.
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { consumerApiBaseUrl } from "@/lib/commerce/catalog-consumer-server";

const TTL_SECONDS = 86_400;

type EphemeralMemoryStore = {
  memory: Map<string, string>;
};

function memoryMap(): Map<string, string> {
  const g = globalThis as typeof globalThis & { __againerpEphemeral?: EphemeralMemoryStore };
  if (!g.__againerpEphemeral) {
    g.__againerpEphemeral = { memory: new Map() };
  }
  return g.__againerpEphemeral.memory;
}

export function serverDataDir(subdir: string): string {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const base = serverless
    ? path.join(os.tmpdir(), "againerp-data")
    : path.join(process.cwd(), ".data");
  return path.join(base, subdir);
}

function localPath(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(serverDataDir("ephemeral"), `${safe}.json`);
}

async function putRemote(key: string, payload: unknown): Promise<void> {
  const url = `${consumerApiBaseUrl()}/api/v1/ephemeral/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ payload, ttl_seconds: TTL_SECONDS }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ephemeral PUT ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function getRemote<T>(key: string): Promise<T | null> {
  const url = `${consumerApiBaseUrl()}/api/v1/ephemeral/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { payload?: T };
  return (body.payload ?? null) as T | null;
}

export async function putEphemeralJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  memoryMap().set(key, raw);

  try {
    await fs.mkdir(path.dirname(localPath(key)), { recursive: true });
    await fs.writeFile(localPath(key), raw, "utf8");
  } catch {
    /* Vercel /tmp may still fail in edge cases — remote is authoritative */
  }

  try {
    await putRemote(key, value);
  } catch (err) {
    // Local/dev can run without API; on Vercel remote is required for cross-instance.
    if (process.env.VERCEL) {
      throw err instanceof Error ? err : new Error("ephemeral remote persist failed");
    }
  }
}

export async function getEphemeralJson<T>(key: string): Promise<T | null> {
  const mem = memoryMap().get(key);
  if (mem) {
    try {
      return JSON.parse(mem) as T;
    } catch {
      /* fall through */
    }
  }

  try {
    const raw = await fs.readFile(localPath(key), "utf8");
    memoryMap().set(key, raw);
    return JSON.parse(raw) as T;
  } catch {
    /* fall through */
  }

  const remote = await getRemote<T>(key);
  if (remote != null) {
    memoryMap().set(key, JSON.stringify(remote));
    try {
      await fs.mkdir(path.dirname(localPath(key)), { recursive: true });
      await fs.writeFile(localPath(key), JSON.stringify(remote), "utf8");
    } catch {
      /* ignore */
    }
  }
  return remote;
}
