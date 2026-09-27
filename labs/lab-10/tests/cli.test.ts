// tests/cli.test.ts
import { describe, it, expect } from "vitest";
import { promisify } from "util";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");
const CLI = path.join(__dirname, "..", "src", "cli.ts");

async function runCLI(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const cwd = path.join(__dirname, "..");
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["--import", "tsx/esm", CLI, ...args],
      { cwd, env: { ...process.env } },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

describe("CLI tool", () => {
  it("encodes a PNG file and prints correct Data URI to stdout", async () => {
    const { stdout, exitCode } = await runCLI([
      path.join(FIXTURES, "test.png"),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^data:image\/png;base64,/);
  });

  it("encodes a JPEG file and prints correct Data URI to stdout", async () => {
    const { stdout, exitCode } = await runCLI([
      path.join(FIXTURES, "test.jpg"),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("encodes an SVG file and prints correct Data URI to stdout", async () => {
    const { stdout, exitCode } = await runCLI([
      path.join(FIXTURES, "test.svg"),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("exits with code 0 on success", async () => {
    const { exitCode } = await runCLI([path.join(FIXTURES, "test.png")]);
    expect(exitCode).toBe(0);
  });

  it("prints usage to stderr and exits with code 1 when no arguments given", async () => {
    const { stderr, exitCode } = await runCLI([]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/usage/i);
  });

  it("prints error to stderr and exits with code 1 for nonexistent file", async () => {
    const { stderr, exitCode } = await runCLI([
      path.join(FIXTURES, "nonexistent.png"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("prints error to stderr and exits with code 1 for unsupported extension", async () => {
    const { stderr, exitCode } = await runCLI([
      path.join(FIXTURES, "test.gif").replace("test.gif", "test.bmp"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
