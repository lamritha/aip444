// src/encode.ts
import { DataURI } from "./types.js";

/**
 * Reads a media file from disk and returns it as a Data URI.
 *
 * @param filePath - Path to the media file
 * @returns A DataURI object with the encoded content
 * @throws Error if the file doesn't exist
 * @throws Error if the file extension is unsupported
 * @throws Error if the file is empty (0 bytes)
 */
export async function encodeFile(filePath: string): Promise<DataURI> {
  // TODO: implement
  throw new Error("Not implemented");
}

/**
 * Encodes a raw Buffer/Uint8Array as a Data URI with
 * the given MIME type.
 *
 * @param data - The raw binary data
 * @param mimeType - A valid MIME type string
 * @returns A DataURI object
 * @throws Error if the MIME type is unsupported
 * @throws Error if the data is empty
 */
export function encodeBuffer(
  data: Buffer | Uint8Array,
  mimeType: string,
): DataURI {
  // TODO: implement
  throw new Error("Not implemented");
}
