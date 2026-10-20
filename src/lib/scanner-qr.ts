import jsQR from "jsqr";

/** Decode codes even when the answer sheet is rotated or the code is not in the top-right corner. */
export async function readAnswerSheetQr(image: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(image);
  try {
    const maxSide = 2300;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const decode = (x: number, y: number, width: number, height: number) => {
      const pixels = context.getImageData(x, y, width, height);
      return jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
    };
    const all = decode(0, 0, canvas.width, canvas.height);
    if (all?.startsWith("intes://answer-sheet/v1/")) return all;
    // Localized search avoids a small QR code being drowned out by printed questions.
    const halfW = Math.ceil(canvas.width / 2);
    const halfH = Math.ceil(canvas.height / 2);
    for (const y of [0, canvas.height - halfH]) {
      for (const x of [0, canvas.width - halfW]) {
        const result = decode(x, y, halfW, halfH);
        if (result?.startsWith("intes://answer-sheet/v1/")) return result;
      }
    }
    return all;
  } finally { bitmap.close(); }
}
