import { readFileSync } from "fs";
import { rgPath } from "@vscode/ripgrep";
import { execSync } from "child_process";

export function readFile(
  filePath: string,
  startLine?: number,
  endLine?: number,
): string {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const start = startLine ?? 1;
    const end = endLine ?? Math.min(start + 999, lines.length);
    content = lines.slice(start - 1, end).join("\n");
    if (end < lines.length) {
      content += `\n[Showing lines ${start}-${end} of ${lines.length} total lines]`;
    }
  } catch {
    return `Error: Could not read file '${filePath}'`;
  }
  return content;
}

export function ripgrep(searchPattern: string): string {
  try {
    let output = execSync(`"${rgPath}" "${searchPattern}" .`, {
      encoding: "utf-8",
    });
    let lines = output.trim().split("\n");
    if (lines.length > 100) {
      const totalLines = lines.length;
      lines = lines.slice(0, 100);
      lines.push(`[Showing first 100 of ${totalLines} matching lines]`);
    }
    output = lines.join("\n");
    return output;
  } catch (error: any) {
    if (error.status === 1) {
      return `No matches found for "${searchPattern}"`;
    }
    return `Error running ripgrep: ${error.message}`;
  }
}
