import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import { PDFParse } from "pdf-parse";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

async function validateUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("在线资源 URL 不合法");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("在线资源仅支持 HTTP 或 HTTPS");
  if (url.username || url.password) throw new Error("在线资源 URL 不能包含凭据");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (!["80", "443"].includes(port)) throw new Error("在线资源不允许使用非标准端口");

  const literalType = isIP(url.hostname);
  const addresses = literalType
    ? [{ address: url.hostname, family: literalType }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("在线资源域名无法解析");
  for (const item of addresses) {
    const blocked = item.family === 4 ? isBlockedIpv4(item.address) : isBlockedIpv6(item.address);
    if (blocked) throw new Error("在线资源地址指向受保护网络，已拒绝访问");
  }
  return url;
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error("在线资源超过 5 MiB 限制");
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("在线资源超过 5 MiB 限制");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function fetchPublicResource(rawUrl: string): Promise<{ data: Buffer; contentType: string; finalUrl: string }> {
  let current = await validateUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html, text/plain, application/pdf;q=0.9, */*;q=0.1",
          "User-Agent": "InteSchool/1.0 (+https://github.com/caosuoming/InteSchool)",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("在线资源请求超时");
      throw new Error(`在线资源请求失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === MAX_REDIRECTS) throw new Error("在线资源重定向次数过多");
      const location = response.headers.get("location");
      if (!location) throw new Error("在线资源重定向缺少目标地址");
      current = await validateUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`在线资源返回 HTTP ${response.status}`);
    return {
      data: await readLimitedBody(response),
      contentType: (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase(),
      finalUrl: current.toString(),
    };
  }
  throw new Error("在线资源请求失败");
}

export async function fetchPublicText(rawUrl: string): Promise<{ text: string; finalUrl: string }> {
  const result = await fetchPublicResource(rawUrl);
  if (result.contentType === "application/pdf") {
    const parser = new PDFParse({ data: result.data });
    try {
      const extracted = await parser.getText();
      return { text: extracted.text.trim(), finalUrl: result.finalUrl };
    } finally {
      await parser.destroy();
    }
  }
  if (result.contentType === "text/plain" || result.contentType === "text/markdown") {
    return { text: result.data.toString("utf8").trim(), finalUrl: result.finalUrl };
  }
  if (result.contentType === "text/html" || result.contentType === "application/xhtml+xml") {
    const $ = load(result.data.toString("utf8"));
    $("script, style, noscript, svg, canvas, iframe").remove();
    const text = $("main, article, body").first().text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    return { text, finalUrl: result.finalUrl };
  }
  throw new Error(`不支持的在线资源类型：${result.contentType}`);
}
