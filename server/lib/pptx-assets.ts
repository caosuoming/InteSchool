import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { extname, posix } from "node:path";

const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const PPT_ASSET_KEY = /^ppt-slide-(\d+)-(rId[\w.-]+)$/i;
const MAX_SLIDE_NUMBER = 500;

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".emf": "image/emf",
  ".wmf": "image/wmf",
};

export interface PptxImageAsset {
  data: Buffer;
  contentType: string;
  fileName: string;
}

function safeImagePath(target: string): string | null {
  const normalized = posix.normalize(
    posix.join("ppt/slides", target.replaceAll("\\", "/")),
  );
  if (!normalized.startsWith("ppt/media/") || normalized.includes("..")) return null;
  return normalized;
}

export async function extractPptxImage(
  data: Buffer,
  assetKey: string,
): Promise<PptxImageAsset | null> {
  const match = assetKey.match(PPT_ASSET_KEY);
  if (!match) return null;
  const slideNumber = Number(match[1]);
  const relationshipId = match[2];
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > MAX_SLIDE_NUMBER) {
    return null;
  }

  const zip = await JSZip.loadAsync(data);
  const relationshipsXml = await zip
    .file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`)
    ?.async("string");
  if (!relationshipsXml) return null;

  const relationships = new DOMParser().parseFromString(
    relationshipsXml,
    "application/xml",
  );
  const entries = Array.from(
    relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"),
  );
  const relationship = entries.find((entry) => entry.getAttribute("Id") === relationshipId);
  if (!relationship || relationship.getAttribute("TargetMode") === "External") return null;
  if (!relationship.getAttribute("Type")?.endsWith("/image")) return null;

  const imagePath = safeImagePath(relationship.getAttribute("Target") || "");
  if (!imagePath) return null;
  const file = zip.file(imagePath);
  if (!file) return null;

  const extension = extname(imagePath).toLowerCase();
  const contentType = IMAGE_MIME_TYPES[extension];
  if (!contentType) return null;

  return {
    data: await file.async("nodebuffer"),
    contentType,
    fileName: posix.basename(imagePath),
  };
}
