import { promises as fs } from "fs";
import {
  MediaTypeSchema,
  DataURISchema,
  getCategory,
  DataURI,
} from "./types.js";

export function parseDataURI(uri: string): DataURI {
  if (!uri.startsWith("data:")) {
    throw new Error('Invalid Data URI: missing "data:" prefix');
  }

  const base64Index = uri.indexOf(";base64,");
  if (base64Index === -1) {
    throw new Error('Invalid Data URI: missing ";base64," separator');
  }

  const mediaType = uri.substring(5, base64Index);
  const base64 = uri.substring(base64Index + 8);

  let validMediaType;
  try {
    validMediaType = MediaTypeSchema.parse(mediaType);
  } catch {
    throw new Error(`Unsupported MIME type: ${mediaType}`);
  }

  const category = getCategory(validMediaType);
  const result = { mediaType: validMediaType, category, base64, raw: uri };
  return DataURISchema.parse(result);
}

export function decodeToBuffer(uri: string): Buffer {
  const { base64: originalBase64 } = parseDataURI(uri);
  // Remove any whitespace like newlines from Base64 payload
  const base64 = originalBase64.replace(/\s+/g, "");
  // Base64 length must be multiple of 4
  if (base64.length % 4 !== 0) {
    throw new Error("Invalid Base64 content length in Data URI");
  }
  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw new Error("Invalid Base64 content in Data URI");
  }
}

export async function decodeToFile(
  uri: string,
  outputPath: string,
): Promise<void> {
  const buffer = decodeToBuffer(uri);
  await fs.writeFile(outputPath, buffer);
}
