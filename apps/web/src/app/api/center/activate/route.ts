import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActivateBody = {
  bootstrap_token?: string;
  center_url?: string;
};

type BindFile = {
  center_url: string;
  client_id: string;
  client_slug: string;
  api_key: string;
  agent_token?: string;
  activated_at: string;
};

function defaultCenterUrl() {
  return (
    process.env.AGAINERP_CENTER_URL ||
    process.env.NEXT_PUBLIC_AGAINERP_CENTER_URL ||
    "https://center-api-production.up.railway.app"
  )
    .trim()
    .replace(/\/$/, "");
}

function bindFilePath() {
  return path.join(process.cwd(), ".data", "center-bind.json");
}

async function readBind(): Promise<BindFile | null> {
  try {
    const raw = await fs.readFile(bindFilePath(), "utf8");
    return JSON.parse(raw) as BindFile;
  } catch {
    return null;
  }
}

async function writeBind(data: BindFile) {
  const dir = path.dirname(bindFilePath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(bindFilePath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Redeem Center bootstrap token and persist fleet credentials for this ERP admin instance.
 */
export async function POST(req: Request) {
  let body: ActivateBody = {};
  try {
    body = (await req.json()) as ActivateBody;
  } catch {
    return NextResponse.json({ ok: false, detail: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.bootstrap_token || "").trim();
  if (!token.startsWith("bst_")) {
    return NextResponse.json(
      { ok: false, detail: "bootstrap_token must start with bst_" },
      { status: 400 },
    );
  }

  let centerUrl = (body.center_url || defaultCenterUrl()).replace(/\/$/, "");
  if (centerUrl.includes("center.againerp.com")) {
    centerUrl = "https://center-api-production.up.railway.app";
  }

  try {
    const res = await fetch(`${centerUrl}/agent/v1/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        bootstrap_token: token,
        instance_id: process.env.AGAINERP_INSTANCE_ID || "erp-admin",
        erp_version: process.env.npm_package_version || "local",
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          detail: typeof data.detail === "string" ? data.detail : res.statusText,
        },
        { status: res.status },
      );
    }

    const bind: BindFile = {
      center_url: centerUrl,
      client_id: String(data.client_id || ""),
      client_slug: String(data.client_slug || ""),
      api_key: String(data.api_key || data.agent_token || ""),
      agent_token: data.agent_token ? String(data.agent_token) : undefined,
      activated_at: new Date().toISOString(),
    };
    if (!bind.client_id || !bind.api_key) {
      return NextResponse.json(
        { ok: false, detail: "Activate response missing client credentials" },
        { status: 502 },
      );
    }
    await writeBind(bind);

    // Keep process env in sync for this Node process (dev convenience)
    process.env.AGAINERP_CENTER_URL = bind.center_url;
    process.env.AGAINERP_CLIENT_ID = bind.client_id;
    process.env.AGAINERP_CLIENT_API_KEY = bind.api_key;
    if (bind.client_slug) process.env.AGAINERP_CLIENT_SLUG = bind.client_slug;

    return NextResponse.json({
      ok: true,
      bound: true,
      client_id: bind.client_id,
      client_slug: bind.client_slug,
      plan: data.plan,
      enabled_modules: data.enabled_modules,
      activated_at: bind.activated_at,
      note: "Credentials saved to .data/center-bind.json. Set the same values in production env for Railway/Vercel.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : "Activate failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  const bind = await readBind();
  const envBound = Boolean(
    process.env.AGAINERP_CLIENT_ID?.trim() &&
      (process.env.AGAINERP_CLIENT_API_KEY?.trim() ||
        process.env.AGAINERP_CLIENT_AGENT_TOKEN?.trim()),
  );
  return NextResponse.json({
    bound: Boolean(bind) || envBound,
    from_file: Boolean(bind),
    from_env: envBound,
    client_id: bind?.client_id || process.env.AGAINERP_CLIENT_ID || null,
    client_slug: bind?.client_slug || process.env.AGAINERP_CLIENT_SLUG || null,
    activated_at: bind?.activated_at || null,
  });
}
