import { parseArgs } from "./cli.js";
import { getReviewInput, buildUserContent } from "./input.js";
import { runReviewer } from "./reviewer.js";
import {
  securityAuditorPrompt,
  maintainabilityCriticPrompt,
} from "./prompts.js";
import { readFileTool, ripgrepTool } from "./toolSchemas.js";

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

  console.log(
    JSON.stringify({ securityIssues, maintainabilityIssues }, null, 2),
  );
}

main();
