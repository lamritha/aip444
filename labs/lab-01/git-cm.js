const OpenAI = require("openai");
const { exec } = require("child_process");
const util = require("util");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

//Added comment
//Added comment 2

function formatDate() {
  const now = new Date();
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0") +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0") +
    ":" +
    String(now.getSeconds()).padStart(2, "0")
  );
}

console.log("git-cm: Developed by Amritha Lingeswaran - 116682246");
console.log("Run Date: " + formatDate());
console.log("--------------------------------------------------------------");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.log("❌ Error: OPENROUTER_API_KEY not found");
  process.exit(1);
}

const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-31b-it:free",
];

const execAsync = util.promisify(exec);

const is_creative = process.argv.includes("--creative");

const DEFAULT_SYSTEM_PROMPT = `
You are an AI assistant running inside a CLI tool that generates semantic Git commit messages.

You will receive a staged git diff as input.

Your task is to generate a concise and meaningful commit message following the Conventional Commits specification.

Rules:
- Output ONLY the commit message.
- Do NOT include explanations, quotes, Markdown, code fences, or extra text.
- Use Conventional Commit prefixes such as:
  - feat:
  - fix:
  - docs:
  - style:
  - refactor:
  - test:
  - chore:
- Keep the message short but descriptive.
- Focus on the primary change shown in the diff.
`;

const CREATIVE_SYSTEM_PROMPT = `
You are a chaotic pirate captain writing wildly creative Git commit messages.

Rules:
- Use Gitmoji.
- Speak in dramatic 17th century pirate slang.
- Make the commit message funny and theatrical.
- Still reference the code changes meaningfully.
`;

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

async function getGitDiff() {
  try {
    const { stdout } = await execAsync("git diff --staged");
    const diff = stdout.trim();

    if (!diff) {
      console.log("❌ No staged changes found.");
      process.exit(1);
    }

    return diff;
  } catch (e) {
    console.log("❌ Not a git repo.");
    process.exit(1);
  }
}

async function generateCommitMessage(diff) {
  const maxRetries = 3;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🤖 Trying model: ${model}`);

        const response = await openai.chat.completions.create({
          model,
          temperature: is_creative ? 1.2 : 0.1,
          messages: [
            {
              role: "system",
              content: is_creative
                ? CREATIVE_SYSTEM_PROMPT
                : DEFAULT_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: diff,
            },
          ],
        });

        return response.choices[0].message.content.trim();
      } catch (e) {
        if (e.status === 429) {
          const delay = attempt * 2000;

          console.log(
            `⚠️ Rate limited on ${model}. Retrying in ${delay / 1000}s...`,
          );

          await sleep(delay);
          continue;
        }

        console.log(`❌ Error ${e.status}: ${e.message}`);
        process.exit(1);
      }
    }
  }

  console.log("❌ All models failed.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const diff = await getGitDiff();

  console.log("🤖 Generating commit message...");

  const reply = await generateCommitMessage(diff);
  console.log("\nSuggested Commit Message: ", reply);
}

main();
