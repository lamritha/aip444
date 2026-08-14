// src/types.ts
import { z } from "zod";

/**
 * All MIME types supported by this library.
 */
export const MediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);

export type MediaType = z.infer<typeof MediaTypeSchema>;

/**
 * The three supported media categories.
 */
export type MediaCategory = "image" | "audio" | "video";

/**
 * A parsed Data URI with its components separated out.
 */
export const DataURISchema = z.object({
  /** The MIME type (e.g. "image/png") */
  mediaType: MediaTypeSchema,
  /** The media category: image, audio, or video */
  category: z.enum(["image", "audio", "video"]),
  /** The raw Base64 string (without the data:...;base64, prefix) */
  base64: z.string().min(1),
  /** The complete Data URI string */
  raw: z.string().startsWith("data:"),
});

export type DataURI = z.infer<typeof DataURISchema>;

/**
 * Maps file extensions (without the dot) to MIME types.
 */
export const EXTENSION_TO_MIME: Record<string, MediaType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

/**
 * Extracts the category from a MIME type string.
 * e.g. "image/png" → "image", "audio/mpeg" → "audio"
 */
export function getCategory(mimeType: MediaType): MediaCategory {
  return mimeType.split("/")[0] as MediaCategory;
}
