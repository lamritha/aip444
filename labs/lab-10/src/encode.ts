import { promises as fs } from 'fs';
import path from 'path';
import { DataURI, DataURISchema, EXTENSION_TO_MIME, MediaTypeSchema, getCategory } from './types.js';

export async function encodeFile(filePath: string): Promise<DataURI> {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeType = EXTENSION_TO_MIME[ext];
  if (!mimeType) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  /**
   * SVG is text-based XML, not binary.
   * Here we read it as a UTF-8 string and encode as base64.
   * Using Buffer for encoding handles both text and binary data correctly.
   */
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }
  if (data.length === 0) {
    throw new Error(`File is empty: ${filePath}`);
  }

  return encodeBuffer(data, mimeType);
}

export function encodeBuffer(data: Buffer | Uint8Array, mimeType: string): DataURI {
  try {
    MediaTypeSchema.parse(mimeType);
  } catch {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
  if (data.length === 0) {
    throw new Error('Cannot encode empty data');
  }

  /**
   * Buffer.from(data).toString('base64') works for both binary (PNG, MP3, etc.)
   * and text-based files like SVG because Buffer handles raw bytes uniformly.
   */
  const base64 = Buffer.from(data).toString('base64');
  const raw = `data:${mimeType};base64,${base64}`;
  const category = getCategory(mimeType as any);

  return DataURISchema.parse({ mediaType: mimeType, category, base64, raw });
}
