const MAX_PAGES = 40;
const MAX_PAGE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 120 * 1024 * 1024;

/** Browser-side limits mirror the scanner upload endpoint and bridge limits. */
export function assertScanBatchSize(images: Blob[], existing: Blob[] = []): void {
  if (existing.length + images.length > MAX_PAGES) throw new Error("单批最多采集 40 页，请先处理已采集的图片");
  const totalBytes = [...existing, ...images].reduce((sum, image) => sum + image.size, 0);
  if (images.some((image) => !image.size || image.size > MAX_PAGE_BYTES) || totalBytes > MAX_BATCH_BYTES) {
    throw new Error("扫描图片每张须不超过 25 MB，整批不超过 120 MB");
  }
}

export async function validateScanImages(files: File[], existing: Blob[] = []): Promise<File[]> {
  if (!files.length) return [];
  assertScanBatchSize(files, existing);
  const normalized: File[] = [];
  for (const file of files) {
    const signature = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(new Error(`无法读取扫描图片「${file.name}」`));
      reader.readAsArrayBuffer(file.slice(0, 8));
    });
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
    const jpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    const mime = png ? "image/png" : jpeg ? "image/jpeg" : null;
    if (!mime || (file.type && file.type !== mime)) {
      throw new Error(`文件「${file.name}」不是有效的 PNG/JPEG 扫描图片`);
    }
    normalized.push(file.type ? file : new File([file], file.name, { type: mime }));
  }
  return normalized;
}
