import type { ProviderId } from "../core/types";
import type { UniversalImage } from "../models/UniversalImage";
import type { UniversalVideo } from "../models/UniversalProduct";
import { createId } from "../utils";
import { normalizeNumber, normalizeUrl } from "./normalize";
import type { FieldTrace } from "./validation";

export function mapImages(
  urls: unknown,
  traces: FieldTrace[],
  sourcePath = "img_urls",
): UniversalImage[] {
  const list = Array.isArray(urls) ? urls : urls ? [urls] : [];
  const images: UniversalImage[] = [];

  list.forEach((raw, index) => {
    const url = normalizeUrl(raw);
    if (!url) {
      traces.push({
        universalField: `images[${index}]`,
        sourcePath: `${sourcePath}[${index}]`,
        status: "missing",
      });
      return;
    }
    images.push({
      id: createId("img"),
      url,
      thumbnail: url,
      position: index,
    });
    traces.push({
      universalField: `images[${index}]`,
      sourcePath: `${sourcePath}[${index}]`,
      status: "mapped",
      value: url,
    });
  });

  return images;
}

export function mapVideos(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "video_urls",
): UniversalVideo[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const videos: UniversalVideo[] = [];

  const detailUrl = normalizeUrl(o.detail_url);
  if (detailUrl) {
    videos.push({
      id: createId("vid"),
      url: detailUrl,
      thumbnail: normalizeUrl(o.thumbnail_url) ?? undefined,
    });
    traces.push({
      universalField: "videos[0]",
      sourcePath: `${sourcePath}.detail_url`,
      status: "mapped",
      value: detailUrl,
    });
  }

  return videos;
}

export function mapSingleImage(
  url: unknown,
  position = 0,
  traces?: FieldTrace[],
  sourcePath = "img_url",
): UniversalImage | undefined {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    traces?.push({
      universalField: "images[0]",
      sourcePath,
      status: "missing",
    });
    return undefined;
  }
  traces?.push({
    universalField: "images[0]",
    sourcePath,
    status: "mapped",
    value: normalized,
  });
  return {
    id: createId("img"),
    url: normalized,
    thumbnail: normalized,
    position,
  };
}

export function collectIgnoredFields(
  raw: Record<string, unknown>,
  usedPaths: Set<string>,
  traces: FieldTrace[],
): void {
  for (const key of Object.keys(raw)) {
    if (usedPaths.has(key)) continue;
    traces.push({
      universalField: "(ignored)",
      sourcePath: key,
      status: "ignored",
      value: raw[key],
    });
  }
}

export type MappingContext = {
  provider: ProviderId;
  traces: FieldTrace[];
  usedPaths: Set<string>;
};

export function traceField(
  ctx: MappingContext,
  universalField: string,
  sourcePath: string,
  value: unknown,
  mapped = true,
): void {
  ctx.usedPaths.add(sourcePath.split(".")[0].split("[")[0]);
  ctx.traces.push({
    universalField,
    sourcePath,
    status: mapped && value != null && value !== "" ? "mapped" : "missing",
    value,
  });
}
