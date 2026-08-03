import type { Material, MaterialType } from "@/types";

const VIDEO_FILE_PATTERN = /\.(?:mp4|webm|ogg|ogv|mov|m4v|avi|mkv|mpeg|mpg|3gp)(?:$|[?#])/i;
const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|bmp)(?:$|[?#])/i;
const AUDIO_FILE_PATTERN = /\.(?:mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/i;
const TEXT_FILE_PATTERN = /\.(?:txt|md|markdown|csv)(?:$|[?#])/i;

export function looksLikeVideoFile(value?: string): boolean {
  return Boolean(value && VIDEO_FILE_PATTERN.test(value.trim()));
}

export function isVideoMaterial(
  material: Pick<Material, "type" | "title" | "content" | "fileUrl">,
): boolean {
  if (material.type === "video") return true;
  return [material.fileUrl, material.content, material.title].some(looksLikeVideoFile);
}

export function inferMaterialTypeFromFile(
  file: Pick<File, "name" | "type">,
): MaterialType {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("video/") || VIDEO_FILE_PATTERN.test(file.name)) return "video";
  if (mimeType.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name)) return "image";
  if (mimeType.startsWith("audio/") || AUDIO_FILE_PATTERN.test(file.name)) return "audio";
  if (mimeType.startsWith("text/") || TEXT_FILE_PATTERN.test(file.name)) return "text";
  return "file";
}
