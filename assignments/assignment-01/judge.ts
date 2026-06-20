import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import type { Issue } from "./schema.js";
import { judgePrompt } from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export async function runJudge(
  securityIssues: Issue[],
  maintainabilityIssues: Issue[],
  debug: boolean,
): Promise<string> {
  const userContent = `Security Auditor findings:\n${JSON.stringify(securityIssues, null, 2)}\n\nMaintainability Critic findings:\n${JSON.stringify(maintainabilityIssues, null, 2)}`;

  if (debug)
    console.error(
      `[Judge] Synthesizing ${securityIssues.length + maintainabilityIssues.length} total issues...`,
    );

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: judgePrompt },
          { role: "user", content: userContent },
        ],
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`OpenRouter API Error: ${response.status}`, error);
    process.exit(1);
  }

  const data = (await response.json()) as any;
  const html = data.choices[0].message.content;

  if (debug)
    console.error(
      `[Judge] Finished generating HTML report (${html.length} chars)`,
    );

  const cleaned = html
    .replace(/^```html\n?/, "")
    .replace(/```$/, "")
    .trim();
  return cleaned;
}
