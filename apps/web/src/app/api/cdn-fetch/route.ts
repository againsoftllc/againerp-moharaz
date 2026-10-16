import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ALICDN_REFERERS = [
  "https://detail.1688.com/",
  "https://www.1688.com/",
  "https://sale.1688.com/",
  "https://www.alibaba.com/",
  "https://s.alicdn.com/",
  "https://www.taobao.com/",
];

function restoreAlicdnBang(value: string) {
  if (value.includes("___") && !value.includes("_!!")) {
    return value.replace(/___/g, "_!!");
  }
  return value;
}

function urlCandidates(url: string, names: string[] = []): string[] {
  const out: string[] = [];
  const push = (u: string) => {
    const t = u.trim();
    if (!t || out.includes(t)) return;
    if (!/^https?:\/\//i.test(t)) return;
    out.push(t);
  };

  if (url) {
    push(url);
    const restored = restoreAlicdnBang(url);
    if (restored !== url) push(restored);
    if (url.includes("alicdn.com")) {
      push(url.replace("https://img.alicdn.com/", "https://cbu01.alicdn.com/"));
      push(url.replace("https://cbu01.alicdn.com/", "https://img.alicdn.com/"));
    }
  }

  for (const name of names) {
    const raw = name.split("/").pop() || name;
    if (!raw) continue;
    const restored = restoreAlicdnBang(raw);
    for (const filename of [raw, restored]) {
      if (
        !filename.includes("O1CN") &&
        !filename.toLowerCase().includes("alicdn") &&
        !filename.includes("!!") &&
        !filename.includes("___")
      ) {
        continue;
      }
      push(`https://cbu01.alicdn.com/img/ibank/${filename}`);
      push(`https://img.alicdn.com/imgextra/${filename}`);
    }
  }

  return out;
}

function looksLikeMedia(bytes: ArrayBuffer, contentType: string) {
  if (bytes.byteLength < 32) return false;
  const ctype = (contentType || "").toLowerCase();
  if (ctype.includes("image/") || ctype.includes("video/") || ctype.includes("octet-stream")) {
    return true;
  }
  const sig = new Uint8Array(bytes.slice(0, 12));
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return true;
  if (
    sig[0] === 0x89 &&
    sig[1] === 0x50 &&
    sig[2] === 0x4e &&
    sig[3] === 0x47
  ) {
    return true;
  }
  if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46) return true;
  return false;
}

/**
 * Server-side CDN fetch from Vercel (different IP pool than Railway).
 * Used when Move to R2 cannot download Alibaba CDN from the API host.
 */
export async function POST(req: NextRequest) {
  // Prefer Authorization header; cookie-less admin uses bearer from client.
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    // Soft gate: still allow if same-origin and session cookie present later.
    // For now require bearer to avoid open SSRF proxy.
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string; names?: string[] };
  try {
    body = (await req.json()) as { url?: string; names?: string[] };
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url && !(body.names || []).length) {
    return NextResponse.json({ detail: "url required" }, { status: 400 });
  }

  let lastStatus = "no-response";
  for (const candidate of urlCandidates(url, body.names || [])) {
    let host = "";
    try {
      host = new URL(candidate).hostname.toLowerCase();
    } catch {
      continue;
    }

    const needsReferer =
      host.includes("alicdn") ||
      host.includes("alibaba") ||
      host.includes("taobao") ||
      host.includes("1688");
    const referers = needsReferer ? [...ALICDN_REFERERS, ""] : [""];

    for (const referer of referers) {
      const headers: Record<string, string> = {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
      };
      if (referer) headers.Referer = referer;

      try {
        const res = await fetch(candidate, {
          headers,
          redirect: "follow",
          cache: "no-store",
        });
        lastStatus = String(res.status);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const ctype = res.headers.get("content-type") || "application/octet-stream";
        if (!looksLikeMedia(buf, ctype)) continue;
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type": ctype,
            "Cache-Control": "no-store",
            "X-Fetched-From": candidate.slice(0, 200),
          },
        });
      } catch (err) {
        lastStatus = err instanceof Error ? err.message.slice(0, 80) : "fetch-error";
      }
    }
  }

  return NextResponse.json(
    {
      detail: `Could not download source (${lastStatus}). Remote CDN blocked the proxy.`,
    },
    { status: 502 },
  );
}
