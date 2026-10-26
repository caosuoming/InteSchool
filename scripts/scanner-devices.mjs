import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PAGE = 25 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_BATCH = 120 * 1024 * 1024;
const SCRIPT = resolve(process.env.SCANNER_SCRIPTS_DIR || dirname(fileURLToPath(import.meta.url)), "scanner-wia.ps1");

export function decodeScannerOutput(bytes, { platform = process.platform, legacyEncoding = process.env.SCANNER_WINDOWS_ENCODING || "gb18030" } = {}) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
    if (platform !== "win32") return bytes.toString("utf8");
    // Older Windows scanner drivers and NAPS2 Console emit the system ANSI code page.
    return new TextDecoder(legacyEncoding).decode(bytes);
  }
}

export function execScanner(command, args, timeout = 240_000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "buffer", maxBuffer: 1024 * 1024, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) { resolve(decodeScannerOutput(stdout)); return; }
        const details = [decodeScannerOutput(stderr), decodeScannerOutput(stdout)].filter(Boolean).join("\n").trim();
        const message = /\bNoMedia\b|No scanned pages to export/i.test(details)
          ? "扫描仪未检测到纸张，请向自动进纸器放入纸张后重试"
          : details || error.message;
        reject(new Error(message.slice(0, 400)));
      });
  });
}

function pngOrJpeg(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 2).toString() === "BM") return "image/bmp";
  throw new Error("扫描仪返回了无法识别的图像格式");
}

function findNaps2() {
  if (process.env.NAPS2_CONSOLE) return process.env.NAPS2_CONSOLE;
  const installDir = process.env.ProgramFiles || "C:\\Program Files";
  return join(installDir, "NAPS2", "NAPS2.Console.exe");
}

export function createScannerDevices({ platform = process.platform, execute = execScanner, naps2 = findNaps2() } = {}) {
  const windows = platform === "win32";
  async function listDevices() {
    const devices = [];
    const errors = [];
    if (windows) {
      try {
        const result = await execute("powershell.exe", ["-NoProfile", "-Sta", "-File", SCRIPT, "-Action", "List"]);
        const parsed = JSON.parse(result.replace(/^\uFEFF/, "").trim());
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          if (item?.id && item?.name) devices.push({ id: `wia:${item.id}`, name: item.name, driver: "WIA", duplex: false });
        }
      } catch (error) { errors.push(`WIA: ${error.message}`); }
      for (const driver of ["twain"]) {
        try {
          const names = await execute(naps2, ["--listdevices", "--driver", driver], 15_000);
          for (const name of names.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
            devices.push({ id: `${driver}:${name}`, name, driver: "TWAIN (NAPS2)", duplex: true });
          }
        } catch (error) {
          const message = /ENOENT/i.test(error.message)
            ? "未找到 NAPS2.Console.exe；如扫描仪仅提供 TWAIN 驱动，请安装 NAPS2 和设备厂商驱动"
            : error.message;
          errors.push(`TWAIN: ${message}`);
        }
      }
    } else {
      try {
        const result = await execute("scanimage", ["-f", "%d\t%v %m\n"], 15_000);
        for (const row of result.split(/\r?\n/)) {
          const [id, name] = row.split("\t");
          if (id && name) devices.push({ id: `sane:${id}`, name: name.trim(), driver: "SANE", duplex: true });
        }
      } catch (error) { errors.push(`SANE: ${error.message}`); }
    }
    return { devices, diagnostics: devices.length ? [] : errors };
  }

  async function scan({ deviceId, duplex = true }) {
    const available = await listDevices();
    const device = available.devices.find((item) => item.id === deviceId);
    if (!device) throw new Error("扫描仪已断开或驱动不可用，请刷新设备列表并检查 WIA/TWAIN/SANE 驱动");
    if (duplex && !device.duplex) throw new Error("该 WIA 通道不支持受控双面扫描，请选择 TWAIN 设备或关闭双面模式");
    const dir = await mkdtemp(join(tmpdir(), "inteschool-scan-"));
    try {
      if (device.id.startsWith("twain:")) {
        // High-resolution color PNGs can exceed the 120 MB batch limit after only a few pages.
        // JPEG at high quality preserves answer-sheet markings while keeping ADF batches manageable.
        await execute(naps2, ["-o", join(dir, "page-$(nnnn).jpg"), "--noprofile", "--driver", "twain", "--device", device.name,
          "--source", duplex ? "duplex" : "feeder", "--dpi", "300", "--jpegquality", "90"]);
      } else if (device.id.startsWith("wia:")) {
        await execute("powershell.exe", ["-NoProfile", "-Sta", "-File", SCRIPT, "-Action", "Scan", "-DeviceId", device.id.slice(4), "-OutputFile", join(dir, "page-0001.png")]);
      } else {
        const name = device.id.slice(5);
        let args = ["--device-name", name, "--format=png", "--resolution", "300", `--batch=${join(dir, "page-%04d.png")}`, `--batch-count=${MAX_PAGES}`];
        if (duplex) {
          const help = await execute("scanimage", ["--device-name", name, "--help"], 15_000);
          if (!/ADF Duplex|Duplex ADF|Duplex/i.test(help)) throw new Error("该 SANE 设备未报告双面进纸选项，请关闭双面模式或检查驱动");
          const source = help.includes("ADF Duplex") ? "ADF Duplex" : "Duplex ADF";
          args = [...args, "--source", source];
        }
        try { await execute("scanimage", args); } catch (error) {
          if ((await readdir(dir)).length === 0) throw error;
        }
      }
      const paths = (await readdir(dir)).filter((name) => /^page-\d+\.(?:png|jpg|jpeg)$/i.test(name)).sort();
      if (!paths.length) throw new Error("扫描完成但没有获取到图像，请检查进纸器、设备纸源和驱动");
      if (paths.length > MAX_PAGES) throw new Error("单批最多扫描 40 页");
      let bytes = 0;
      const pages = [];
      for (const name of paths) {
        const data = await readFile(join(dir, name));
        bytes += data.length;
        if (!data.length || data.length > MAX_PAGE || bytes > MAX_BATCH) throw new Error("图像超过单页 25 MB 或单批 120 MB 限额");
        pages.push({ mime: pngOrJpeg(data), data: data.toString("base64") });
      }
      return { pages };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  return { listDevices, scan };
}
