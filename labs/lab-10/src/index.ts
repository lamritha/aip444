// src/index.ts — Public API
export { encodeFile, encodeBuffer } from "./encode.js";
export { parseDataURI, decodeToBuffer, decodeToFile } from "./decode.js";
export {
  MediaTypeSchema,
  DataURISchema,
  EXTENSION_TO_MIME,
  getCategory,
} from "./types.js";
export type { MediaType, MediaCategory, DataURI } from "./types.js";
