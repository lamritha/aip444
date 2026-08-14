// src/decode.ts
import { DataURI } from "./types.js";

/**
 * Parses a Data URI string into its components.
 *
 * @param uri - A complete Data URI string
 *   (e.g. "data:image/png;base64,iVBOR...")
 * @returns A DataURI object with parsed components
 * @throws Error if the string is not a valid Data URI
 * @throws Error if the MIME type is unsupported
 * @throws Error if the Base64 content is invalid
 */
export function parseDataURI(uri: string): DataURI {
  // TODO: implement
  throw new Error("Not implemented");
}

/**
 * Decodes a Data URI string back into raw binary data.
 *
 * @param uri - A complete Data URI string
 * @returns A Buffer containing the decoded binary data
 * @throws Error if the URI is invalid
 */
export function decodeToBuffer(uri: string): Buffer {
  // TODO: implement
  throw new Error("Not implemented");
}

/**
 * Decodes a Data URI and writes the result to a file.
 *
 * @param uri - A complete Data URI string
 * @param outputPath - Where to write the decoded file
 * @throws Error if the URI is invalid
 */
export async function decodeToFile(
  uri: string,
  outputPath: string,
): Promise<void> {
  // TODO: implement
  throw new Error("Not implemented");
}
