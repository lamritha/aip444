const { parseArgs } = require("node:util");
const { readFile } = require("node:fs/promises");
const OpenAI = require("openai");
const { exec } = require("child_process");
const util = require("util");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

function parseArguments() {
  const options = {
    cards: {
      type: "string",
      short: "c",
      default: "3",
    },
  };

  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({ options, allowPositionals: true }));
  } catch (err) {
    console.error("❌ Error parsing arguments:", err.message);
    process.exit(1);
  }

  // Check for notes path
  if (positionals.length === 0) {
    console.error("❌ Error: Please provide a path to notes file");
    console.error("Usage: node flashcards.js <notes-path> [--cards N]");
    process.exit(1);
  }

  const notesPath = positionals[0];
  const cards = parseInt(values.cards);

  // Validate cards range
  if (isNaN(cards) || cards < 1 || cards > 5) {
    console.error("❌ Error: --cards must be between 1 and 5");
    process.exit(1);
  }

  return { notesPath, cards };
}

const { notesPath, cards } = parseArguments();
const execAsync = util.promisify(exec);

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

console.log("flashcard: Developed by Amritha Lingeswaran - 116682246");
console.log("Run Date: " + formatDate());
console.log("--------------------------------------------------------------");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.log("❌ Error: OPENROUTER_API_KEY not found");
  process.exit(1);
}

async function getFileContents(path, description) {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    console.error(`❌ Error: ${description} not found: ${path}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

function buildUserPrompt(notesContent, cards) {
  return `
Generate exactly ${cards} ACE flashcards.

IMPORTANT RULES:
- Use ONLY information from the provided notes
- Do NOT hallucinate or invent facts
- Every EVIDENCE field must contain a direct quote from the notes
- Expand all acronyms in the CHALLENGE section
- MISCONCEPTION must sound like a real confused student quote
- If the notes are insufficient, explain why instead of generating weak cards

<notes>
${notesContent}
</notes>

Remember:
- Verify information exists in the notes before using it
- Only generate cards supported by the notes
`;
}

function extractCards(output) {
  const cardRegex = /=== CARD \d+ ===[\s\S]*?(?=\n=== CARD|\s*$)/g;

  const cards = output.match(cardRegex);

  if (!cards) {
    console.log("\nModel Response:\n");
    console.log(output);
    process.exit(0);
  }

  return cards;
}

async function generateFlashcards(openai, systemPrompt, userPrompt) {
  const models = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "openai/gpt-4.1-nano",
  ];

  for (const model of models) {
    try {
      console.log(`\nTrying model: ${model}`);

      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      console.log(`✅ Success using: ${model}`);

      return response.choices[0]?.message?.content;
    } catch (err) {
      console.log(`⚠️ Model failed: ${model}`);
      console.log(`   ${err.message}`);
    }
  }

  throw new Error("All models failed.");
}

async function main() {
  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
  });

  const systemPrompt = await getFileContents(
    "SYSTEM_PROMPT.md",
    "System prompt file",
  );

  const notesContent = await getFileContents(notesPath, "Notes file");

  const userPrompt = buildUserPrompt(notesContent, cards);

  const output = await generateFlashcards(openai, systemPrompt, userPrompt);

  if (!output) {
    console.error("❌ Empty response from model.");
    process.exit(1);
  }

  const extractedCards = extractCards(output);

  console.log(`\n✅ Generated ${extractedCards.length} flashcard(s):\n`);

  extractedCards.forEach((card) => {
    console.log(card);
    console.log();
  });
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err.message);
  process.exit(1);
});
