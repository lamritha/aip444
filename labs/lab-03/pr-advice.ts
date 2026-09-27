import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

interface ParsedPR {
  owner: string;
  repo: string;
  number: number;
}

function parsePRUrl(input: string): ParsedPR {
  const url = new URL(input);

  if (url.origin !== "https://github.com") {
    console.error("Error: URL must be a GitHub URL (https://github.com/...)");
    process.exit(1);
  }

  // path looks like: /microsoft/vscode/pull/289801
  const parts = url.pathname.split("/").filter(Boolean);
  // After split + filter: ["microsoft", "vscode", "pull", "289801"]

  if (parts.length !== 4 || parts[2] !== "pull") {
    console.error("Error: URL must be a GitHub PR URL like https://github.com/owner/repo/pull/123");
    process.exit(1);
  }

  return {
    owner: parts[0]!,
    repo: parts[1]!,
    number: parseInt(parts[3]!, 10),
  };
}

async function fetchDiff(owner: string, repo: string, number: number): Promise<string> {
  const url = `https://github.com/${owner}/${repo}/pull/${number}.diff`;
  console.log(`Fetching diff from: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    console.error(`Error fetching diff: ${response.status}`);
    process.exit(1);
  }

  let diff = await response.text();

  const MAX_CHARS = 95000;
  if (diff.length > MAX_CHARS) {
    console.warn("Warning: Diff is too long, truncating...");
    diff = diff.slice(0, MAX_CHARS) + "\n...[Diff Truncated]...";
  }

  return diff;
}

interface Comment {
  username: string;
  body: string;
  date: string;
}

async function fetchComments(owner: string, repo: string, number: number): Promise<Comment[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;
  console.log(`Fetching comments from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "AIP444-Lab-03",
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    console.error(`GitHub API Error: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json() as any[];

  return data.map((item) => ({
    username: item.user.login,
    body: item.body,
    date: item.updated_at,
  }));
}

function buildPrompt(diff: string, comments: Comment[]): { system: string; user: string } {
  const system = `You are a Senior Software Engineer with 15+ years of experience doing code reviews.
Your job is to help junior developers understand GitHub Pull Requests clearly and deeply.
Your tone is educational, direct, and rigorous. You value code safety and maintainability over cleverness.

When analyzing a PR, you MUST follow this reasoning process in order:
1. First, carefully read the diff to understand the technical reality of what changed
2. Next, read the comment thread to understand the human context — why changes were made, what concerns were raised
3. Then reflect on assumptions, risks, and the broader context of the changes
4. Finally, synthesize everything into your report

Your output must be a Markdown report with EXACTLY these sections:

## tl;dr
One sentence (max 30 words) summarizing the PR's purpose.

## Stakeholders
A bullet list of every person who participated, with a one-line description of their stance or contribution.

## Changes
A file-by-file breakdown of what changed and why. Write this for a junior developer — explain the "why", not just the "what".

## Risks
Potential bugs, unhandled edge cases, or hidden assumptions. Rate each as Low, Medium, or High severity.

## Learning
3 questions that test the reader's understanding of the changes, written in the style of a senior dev quizzing a junior dev. For example: "Why did the author choose X over Y on line Z?"`;

  const formattedComments = comments.map((c) =>
    `<comment username="${c.username}" date="${c.date}">${c.body}</comment>`
  ).join("\n");

  const user = `Please analyze this Pull Request.

\`\`\`diff
${diff}
\`\`\`

<thread>
${formattedComments}
</thread>`;

  return { system, user };
}

async function callAI(system: string, user: string): Promise<string> {
  console.log("\nSending to AI, please wait...");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`OpenRouter API Error: ${response.status}`, error);
    process.exit(1);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// --- Quick test ---

const url = process.argv[2];

if (!url) {
  console.error("Usage: npx ts-node --esm pr-advice.ts <github-pr-url>");
  process.exit(1);
}

const parsed = parsePRUrl(url);
console.log("Parsed PR:", parsed);

const diff = await fetchDiff(parsed.owner, parsed.repo, parsed.number);
const comments = await fetchComments(parsed.owner, parsed.repo, parsed.number);

console.log(`Fetched diff (${diff.length} chars) and ${comments.length} comments`);

const { system, user } = buildPrompt(diff, comments);
const report = await callAI(system, user);

console.log("\n" + report);