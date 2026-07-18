import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import sharp from "sharp";
import { tavily } from "@tavily/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { OPENROUTER_API_KEY, TAVILY_API_KEY } = process.env;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in ../../.env");
  process.exit(1);
}

if (!TAVILY_API_KEY) {
  console.error("Missing TAVILY_API_KEY in ../../.env");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });

const MODEL = "google/gemini-2.5-flash-lite";
const MAX_ITERATIONS = 5;

const lookupErrorTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "lookup_error",
    description:
      "Searches the web for technical documentation, coding errors, and other details to help with debugging the error.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up documentation or error details.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are an expert senior developer and debugging assistant. You specialize in analyzing screenshots of technical errors from terminals, IDEs, browsers, and other developer tools.

When given a screenshot, follow this exact process:

## Step 1: Describe
Carefully read everything visible in the screenshot. Identify:
- The exact error message or code (copy it word for word)
- The file name and line number if visible
- The programming language, framework, or library involved
- Any version numbers mentioned
- The type of environment (terminal, browser console, IDE, etc.)

## Step 2: Search
- If you see a specific error message, library name, or version number, ALWAYS use the lookup_error tool to find current documentation and known fixes
- Search for the exact error text first, then search for the library/framework version if relevant
- Prefer recent results — errors in new frameworks often have updated solutions

## Step 3: Analyze
- Explain the root cause of the error in plain English
- Reference specific line numbers or file names from the screenshot where relevant
- Cross-reference what you see with what you found in your search

## Step 4: Fix
- Provide a concrete, copy-pasteable fix — either a code snippet or terminal command
- Explain why this fix works
- If there are multiple possible fixes, list them in order of likelihood

## Step 5: Sources
- Always cite the URLs from your search results at the bottom of your response
- Format them as a numbered list under a "Sources" heading

## Important Rules
- Never guess at version-specific behavior — always use the lookup_error tool to verify
- If the error involves a library updated after 2024, assume your training knowledge may be outdated and search anyway
- If you cannot identify a technical error in the image, say exactly: "I cannot identify a technical error in this image" and describe what you see instead`;

interface ProcessedImage {
  base64: string;
  dataUri: string;
}

function bytesToKb(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}

async function processImage(filePath: string): Promise<ProcessedImage> {
  const absolutePath = path.resolve(filePath);
  const originalBuffer = await fs.readFile(absolutePath);

  const processedBuffer = await sharp(originalBuffer)
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const base64 = processedBuffer.toString("base64");

  console.error(`Original size: ${bytesToKb(originalBuffer.length)} KB`);
  console.error(`Processed size: ${bytesToKb(processedBuffer.length)} KB`);
  console.error(`Base64 size: ${bytesToKb(base64.length)} KB`);

  return {
    base64,
    dataUri: `data:image/jpeg;base64,${base64}`,
  };
}

interface LookupErrorArgs {
  query: string;
}

function parseLookupErrorArgs(raw: string): LookupErrorArgs | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "query" in parsed &&
      typeof (parsed as { query: unknown }).query === "string"
    ) {
      return { query: (parsed as { query: string }).query };
    }
    return null;
  } catch {
    return null;
  }
}

async function executeLookupError(query: string): Promise<string> {
  console.error(`Looking up: ${query}`);

  const response = await tavilyClient.search(query, {
    maxResults: 5,
    searchDepth: "basic",
  });

  const results = response.results.map((result, index) => ({
    rank: index + 1,
    title: result.title,
    url: result.url,
    content: result.content,
  }));

  return JSON.stringify(
    {
      query: response.query,
      answer: response.answer ?? null,
      results,
    },
    null,
    2,
  );
}

async function debugScreenshot(dataUri: string): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: dataUri },
        },
        {
          type: "text",
          text: "Please analyze this screenshot and help me debug the error.",
        },
      ],
    },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [lookupErrorTool],
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("No completion choice returned from the model.");
    }

    const message = choice.message;
    messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return message.content ?? "No response generated.";
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: Unsupported tool call type.",
        });
        continue;
      }

      if (toolCall.function.name !== "lookup_error") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error: Unknown tool "${toolCall.function.name}".`,
        });
        continue;
      }

      const args = parseLookupErrorArgs(toolCall.function.arguments);
      if (!args) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content:
            "Error: Could not parse tool arguments. Please provide a valid JSON object with a string query.",
        });
        continue;
      }

      try {
        const result = await executeLookupError(args.query);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Unknown search error";
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error performing web search: ${detail}`,
        });
      }
    }
  }

  return "Error: max iterations reached without a final response.";
}

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: npx tsx img-debug.ts <path-to-screenshot>");
    process.exit(1);
  }

  try {
    await fs.access(imagePath);
  } catch {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
  }

  try {
    const { dataUri } = await processImage(imagePath);
    const answer = await debugScreenshot(dataUri);
    console.log(answer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${detail}`);
    process.exit(1);
  }
}

main();
