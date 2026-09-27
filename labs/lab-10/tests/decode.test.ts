// tests/decode.test.ts
import { describe, it, expect } from "vitest";
import { parseDataURI, decodeToBuffer, decodeToFile } from "../src/decode.js";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, unlinkSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");

// A known valid PNG Data URI (1x1 transparent pixel)
const VALID_PNG_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("parseDataURI", () => {
  it("parses a valid PNG Data URI correctly", () => {
    const result = parseDataURI(VALID_PNG_URI);
    expect(result.mediaType).toBe("image/png");
    expect(result.category).toBe("image");
    expect(result.base64).toBe(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    );
    expect(result.raw).toBe(VALID_PNG_URI);
  });

  it("parses a JPEG Data URI correctly", () => {
    const uri =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=";
    const result = parseDataURI(uri);
    expect(result.mediaType).toBe("image/jpeg");
    expect(result.category).toBe("image");
  });

  it("throws for a string missing the data: prefix", () => {
    expect(() => parseDataURI("image/png;base64,abc123")).toThrow();
  });

  it("throws for a string missing ;base64,", () => {
    expect(() => parseDataURI("data:image/png,abc123")).toThrow();
  });

  it("throws for an unsupported MIME type", () => {
    expect(() => parseDataURI("data:image/bmp;base64,abc123")).toThrow();
  });

  it("throws for completely invalid input", () => {
    expect(() => parseDataURI("not a uri at all")).toThrow();
  });
});

describe("decodeToBuffer", () => {
  it("decodes a valid Data URI to a Buffer", () => {
    const buffer = decodeToBuffer(VALID_PNG_URI);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("throws for an invalid Data URI", () => {
    expect(() => decodeToBuffer("not-a-uri")).toThrow();
  });
});

describe("decodeToFile", () => {
  it("writes decoded content to a file", async () => {
    const outputPath = path.join(FIXTURES, "output-test.png");
    if (existsSync(outputPath)) unlinkSync(outputPath);

    await decodeToFile(VALID_PNG_URI, outputPath);

    expect(existsSync(outputPath)).toBe(true);
    const written = readFileSync(outputPath);
    expect(written.length).toBeGreaterThan(0);

    unlinkSync(outputPath);
  });

  it("throws for an invalid Data URI", async () => {
    await expect(
      decodeToFile("not-a-uri", path.join(FIXTURES, "output.png")),
    ).rejects.toThrow();
  });

  it("decodes a Data URI with newlines in Base64 payload", () => {
    const uriWithNewlines = VALID_PNG_URI.replace(
      /;base64,(.+)$/,
      (_, b64) => `;base64,${b64.slice(0, 10)}\n${b64.slice(10)}`,
    );
    const buffer = decodeToBuffer(uriWithNewlines);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("throws for a Data URI with truncated Base64", () => {
    const truncatedURI = "data:image/png;base64,iVBORw0KGgo";
    expect(() => decodeToBuffer(truncatedURI)).toThrow();
  });
});
