import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const pairedOriginsFile = () => process.env.INTESCHOOL_SCANNER_ORIGINS_FILE ||
  join(process.env.APPDATA || join(homedir(), ".config"), "InteSchool", "Scanner", "origins.json");

export function validateWebsiteOrigin(input) {
  if (typeof input !== "string" || input.length > 300) throw new Error("网站地址无效");
  let url;
  try { url = new URL(input); } catch { throw new Error("网站地址无效"); }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) || url.origin !== input ||
      url.username || url.password) throw new Error("仅允许 HTTPS 网站（本机开发除外）");
  return url.origin;
}

export function parsePairingUri(input) {
  if (typeof input !== "string" || input.length > 600) throw new Error("连接请求无效");
  let url;
  try { url = new URL(input); } catch { throw new Error("连接请求无效"); }
  if (url.protocol !== "inteschool-scanner:" || url.host !== "connect" || url.pathname ||
      url.hash || [...url.searchParams.keys()].join(",") !== "origin") throw new Error("连接请求无效");
  return validateWebsiteOrigin(url.searchParams.get("origin"));
}

export async function readPairedOrigins(path = pairedOriginsFile()) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => {
      try { return validateWebsiteOrigin(item) === item; } catch { return false; }
    }))].slice(0, 16);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    // Damaged configuration must never result in permissive access.
    return [];
  }
}

export async function approveOrigin(origin, path = pairedOriginsFile()) {
  validateWebsiteOrigin(origin);
  const origins = await readPairedOrigins(path);
  const updated = [origin, ...origins.filter((item) => item !== origin)].slice(0, 16);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(updated) + "\n", { mode: 0o600 });
  await rename(temporary, path);
}
