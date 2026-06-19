import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { readFile, ripgrep } from "./tools.js";
import { responseSchema } from "./schema.js";
import type { Issue } from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function callAI(messages: any[], tools: any[]): Promise<any> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: messages,
        tools: tools,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "review_issues",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`OpenRouter API Error: ${response.status}`, error);
    process.exit(1);
  }

  const data = (await response.json()) as any;
  return data.choices[0].message;
}

function executeTool(name: string, args: any): string {
  if (name === "read_file") {
    return readFile(args.file_path, args.start_line, args.end_line);
  }
  if (name === "ripgrep") {
    return ripgrep(args.search_pattern);
  }
  return `Error: Unknown tool '${name}'`;
}

export async function runReviewer(
  systemPrompt: string,
  userContent: string,
  tools: any[],
  reviewerName: string,
  debug: boolean,
): Promise<Issue[]> {
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const maxIterations = 5;
  let iteration = 0;

  if (debug) console.error(`[${reviewerName}] Starting review...`);

  while (iteration < maxIterations) {
    iteration++;
    const message = await callAI(messages, tools);
    messages.push(message);

    if (!message.tool_calls) {
      if (debug)
        console.error(
          `[${reviewerName}] Finished. Raw output:\n${message.content}`,
        );
      try {
        const parsed = JSON.parse(message.content);
        return parsed.issues;
      } catch (e) {
        console.error(
          `[${reviewerName}] Failed to parse JSON output:`,
          message.content,
        );
        return [];
      }
    }

    for (const call of message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      if (debug)
        console.error(
          `[${reviewerName}] Calling ${call.function.name}(${JSON.stringify(args)})`,
        );

      const result = executeTool(call.function.name, args);
      if (debug)
        console.error(
          `[${reviewerName}] Tool result: ${result.slice(0, 200)}...`,
        );

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  console.error(`[${reviewerName}] Max iterations reached`);
  return [];
}
