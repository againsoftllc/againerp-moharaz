import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api/proxy-to-api";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyToApi(req, `/uploads/${path.map(encodeURIComponent).join("/")}`);
}

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
