// tests/encode.test.ts
import { describe, it, expect } from "vitest";
import { encodeFile, encodeBuffer } from "../src/encode.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");

describe("encodeFile", () => {
  it("encodes a PNG file with correct MIME type", async () => {
    const result = await encodeFile(path.join(FIXTURES, "test.png"));
    expect(result.mediaType).toBe("image/png");
    expect(result.category).toBe("image");
    expect(result.raw).toMatch(/^data:image\/png;base64,/);
    expect(result.base64.length).toBeGreaterThan(0);
  });

  it("encodes a JPEG file with correct MIME type", async () => {
    const result = await encodeFile(path.join(FIXTURES, "test.jpg"));
    expect(result.mediaType).toBe("image/jpeg");
    expect(result.raw).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("encodes an SVG file correctly", async () => {
    const result = await encodeFile(path.join(FIXTURES, "test.svg"));
    expect(result.mediaType).toBe("image/svg+xml");
    expect(result.raw).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("encodes an MP3 file with correct MIME type", async () => {
    const result = await encodeFile(path.join(FIXTURES, "test.mp3"));
    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.category).toBe("audio");
    expect(result.raw).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("encodes an MP4 file with correct MIME type", async () => {
    const result = await encodeFile(path.join(FIXTURES, "test.mp4"));
    expect(result.mediaType).toBe("video/mp4");
    expect(result.category).toBe("video");
  });

  it("throws for a file that does not exist", async () => {
    await expect(
      encodeFile(path.join(FIXTURES, "nonexistent.png")),
    ).rejects.toThrow();
  });

  it("throws for an unsupported file extension", async () => {
    await expect(encodeFile(path.join(FIXTURES, "test.bmp"))).rejects.toThrow();
  });

  it("round-trips correctly — encode then decode produces original bytes", async () => {
    const { decodeToBuffer } = await import("../src/decode.js");
    const result = await encodeFile(path.join(FIXTURES, "test.png"));
    const decoded = decodeToBuffer(result.raw);
    const { readFileSync } = await import("fs");
    const original = readFileSync(path.join(FIXTURES, "test.png"));
    expect(Buffer.from(decoded)).toEqual(original);
  });
});

describe("encodeBuffer", () => {
  it("encodes a buffer with a valid MIME type", () => {
    const data = Buffer.from("hello");
    const result = encodeBuffer(data, "image/png");
    expect(result.mediaType).toBe("image/png");
    expect(result.raw).toMatch(/^data:image\/png;base64,/);
  });

  it("throws for an unsupported MIME type", () => {
    const data = Buffer.from("hello");
    expect(() => encodeBuffer(data, "image/bmp")).toThrow();
  });

  it("throws for empty data", () => {
    const data = Buffer.from("");
    expect(() => encodeBuffer(data, "image/png")).toThrow();
  });
});
