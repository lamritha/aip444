import { parseArgs } from "./cli.js";
import { getReviewInput, buildUserContent } from "./input.js";
import { runReviewer } from "./reviewer.js";
import {
  securityAuditorPrompt,
  maintainabilityCriticPrompt,
} from "./prompts.js";
import { readFileTool, ripgrepTool } from "./toolSchemas.js";
import { writeFileSync } from "fs";
import { runJudge } from "./judge.js";

function generateDefaultFilename(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `review-${dd}-${mm}-${yyyy}-${hh}-${min}-${ss}.html`;
}

async function main() {
  const options = parseArgs();
  const input = getReviewInput(options.file);
  const userContent = buildUserContent(input);

  if (options.debug) {
    console.error(`Mode: ${input.isDiff ? "Git (diff)" : "File"}`);
    console.error(`Running both reviewers in parallel...`);
  }

  const [securityIssues, maintainabilityIssues] = await Promise.all([
    runReviewer(
      securityAuditorPrompt,
      userContent,
      [readFileTool, ripgrepTool],
      "Security",
      options.debug,
    ),
    runReviewer(
      maintainabilityCriticPrompt,
      userContent,
      [readFileTool],
      "Maintainability",
      options.debug,
    ),
  ]);

  if (options.debug) {
    console.error(`\n[Security] Found ${securityIssues.length} issues`);
    console.error(
      `[Maintainability] Found ${maintainabilityIssues.length} issues`,
    );
  }

  const html = await runJudge(
    securityIssues,
    maintainabilityIssues,
    options.debug,
  );

  const outputPath = options.output ?? generateDefaultFilename();
  writeFileSync(outputPath, html, "utf-8");

  console.log(`Review complete. Report saved to: ${outputPath}`);
}

main();
