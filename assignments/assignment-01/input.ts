import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

export interface ReviewInput {
  content: string;
  isDiff: boolean;
  filePath: string | undefined;
}

export function getReviewInput(filePath: string | undefined): ReviewInput {
  if (filePath) {
    // File Mode
    if (!existsSync(filePath)) {
      console.error(`Error: File '${filePath}' not found.`);
      process.exit(1);
    }
    const content = readFileSync(filePath, "utf-8");
    return { content, isDiff: false, filePath };
  }

  // Git Mode
  let diff: string;
  try {
    diff = execSync("git diff --staged", { encoding: "utf-8" });
  } catch (error: any) {
    console.error(`Error running git diff: ${error.message}`);
    process.exit(1);
  }

  if (!diff.trim()) {
    console.error(
      "No staged changes to review. Use 'git add <file>' to stage changes.",
    );
    process.exit(1);
  }

  return { content: diff, isDiff: true, filePath: undefined };
}

export function buildUserContent(input: ReviewInput): string {
  if (input.isDiff) {
    return `You are reviewing a git diff of staged changes.\n\n\`\`\`diff\n${input.content}\n\`\`\``;
  }

  return `You are reviewing the full content of the file: ${input.filePath}\n\nFile path: ${input.filePath}\n\n\`\`\`\n${input.content}\n\`\`\``;
}
