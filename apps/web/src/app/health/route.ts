import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api/proxy-to-api";

export async function GET(req: NextRequest) {
  return proxyToApi(req, "/health");
}

export async function HEAD(req: NextRequest) {
  return proxyToApi(req, "/health");
}
