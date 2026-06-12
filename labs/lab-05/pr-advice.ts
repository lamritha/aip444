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

interface GitHubFile {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export async function readGitHubFiles(files: GitHubFile[]): Promise<string> {
  const results: string[] = [];
  for (const file of files) {
    // If ref looks like a commit SHA (7-40 hex chars), use it directly
    // Otherwise treat it as a branch name and add refs/heads/
    const isCommitSha = /^[0-9a-f]{7,40}$/i.test(file.ref);
    const refPath = isCommitSha ? file.ref : `refs/heads/${file.ref}`;
    const url = `https://raw.githubusercontent.com/${file.owner}/${file.repo}/${refPath}/${file.path}`;
    console.log(`Fetching file from: ${url}`);
    // Try the given ref first, then fallback to master/main
    let response = await fetch(url);

    if (!response.ok && file.ref === "main") {
      const fallbackUrl = `https://raw.githubusercontent.com/${file.owner}/${file.repo}/refs/heads/master/${file.path}`;
      response = await fetch(fallbackUrl);
    }

    if (!response.ok && file.ref === "master") {
      const fallbackUrl = `https://raw.githubusercontent.com/${file.owner}/${file.repo}/refs/heads/main/${file.path}`;
      response = await fetch(fallbackUrl);
    }

    if (!response.ok) {
      return `Error: Could not fetch ${file.path} - status ${response.status}`;
    }
    const content = await response.text();
    const lines = content.split("\n");
    let finalContent = content;
    if (lines.length > 1000) {
      finalContent =
        lines.slice(0, 1000).join("\n") +
        `\n[File Truncated: showing first 1000 lines of ${lines.length} lines]`;
    }
    results.push(`## File: ${file.path}\n\n${finalContent}`);
  }
  return results.join("\n\n---\n\n");
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
    console.error(
      "Error: URL must be a GitHub PR URL like https://github.com/owner/repo/pull/123",
    );
    process.exit(1);
  }

  return {
    owner: parts[0]!,
    repo: parts[1]!,
    number: parseInt(parts[3]!, 10),
  };
}

async function fetchDiff(
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
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

async function fetchComments(
  owner: string,
  repo: string,
  number: number,
): Promise<Comment[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "AIP444-Lab-03",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    console.error(`GitHub API Error: ${response.status}`);
    process.exit(1);
  }

  const data = (await response.json()) as any[];

  return data.map((item) => ({
    username: item.user.login,
    body: item.body,
    date: item.updated_at,
  }));
}

function buildPrompt(
  diff: string,
  comments: Comment[],
  owner: string,
  repo: string,
): { system: string; user: string } {
  const system = `You are a Senior Software Engineer with 15+ years of experience doing code reviews.
Your job is to help junior developers understand GitHub Pull Requests clearly and deeply.
Your tone is educational, direct, and rigorous. You value code safety and maintainability over cleverness.

# Available Tools

You have access to \`read_github_files\` to fetch full file content from GitHub.

## Rules
- You are an automated tool. You CANNOT ask the user for files. If you need a file, call \`read_github_files\` directly.
- When you identify a risk that could be verified by looking at a file, you MUST fetch that file before rating its severity. Do not speculate — verify.
- Fetch \`package.json\` when dependencies are modified or when you need to check engines, version, or scripts.
- Fetch source files when logic changes are made and you need surrounding context to understand them.
- Do NOT fetch lock files (pnpm-lock.yaml, package-lock.json) — they are too large and not useful.
- Do NOT fetch files unless you genuinely need them.

## Example
The diff changes a Node.js built-in import. You think "this might break on older Node.js versions."
Before writing your Risks section, you MUST call read_github_files to fetch package.json and check 
the engines field. Only then can you accurately rate the severity.

# Reasoning Process

When analyzing a PR, you MUST follow this reasoning process in order:
1. First, carefully read the diff to understand the technical reality of what changed
2. Next, read the comment thread to understand the human context — why changes were made, what concerns were raised
3. Then identify any risks or unknowns that require file verification — fetch those files NOW before continuing
4. Finally, synthesize everything into your report

# Output Format

Your output must be a Markdown report with EXACTLY these sections:

## tl;dr
One sentence (max 30 words) summarizing the PR's purpose.

## Stakeholders
A bullet list of every person who participated, with a one-line description of their stance or contribution.

## Changes
A file-by-file breakdown of what changed and why. Write this for a junior developer — explain the "why", not just the "what".

## Risks
Potential bugs, unhandled edge cases, or hidden assumptions. Rate each as Low, Medium, or High severity.
For each risk you identify that could be verified by looking at a file, you MUST fetch that file using read_github_files before rating its severity.

## Learning
3 questions that test the reader's understanding of the changes, written in the style of a senior dev quizzing a junior dev. For example: "Why did the author choose X over Y on line Z?"

After fetching any files and completing your verification, you MUST write the complete report 
with ALL five sections: tl;dr, Stakeholders, Changes, Risks, and Learning. Do not skip any section.
`;

  const formattedComments = comments
    .map(
      (c) =>
        `<comment username="${c.username}" date="${c.date}">${c.body}</comment>`,
    )
    .join("\n");

  const user = `Repository: ${owner}/${repo}
Default branch: main (try 'master' if main fails)

Please analyze this Pull Request

\`\`\`diff
${diff}
\`\`\`

<thread>
${formattedComments}
</thread>`;

  return { system, user };
}

async function callAI(messages: any[]): Promise<any> {
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
        tools: [
          {
            type: "function",
            function: {
              name: "read_github_files",
              description:
                "Read one or more files from GitHub repositories. Use this when you need more context about a file mentioned in the diff.",
              parameters: {
                type: "object",
                properties: {
                  files: {
                    type: "array",
                    description: "Array of GitHub file objects to read.",
                    items: {
                      type: "object",
                      properties: {
                        owner: {
                          type: "string",
                          description: "The GitHub repository owner/org.",
                        },
                        repo: {
                          type: "string",
                          description: "The repository name.",
                        },
                        path: {
                          type: "string",
                          description: "The file path within the repo.",
                        },
                        ref: {
                          type: "string",
                          description:
                            "The branch name, commit, or tag (e.g., main).",
                        },
                      },
                      required: ["owner", "repo", "path", "ref"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["files"],
                additionalProperties: false,
              },
            },
          },
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
  return data.choices[0].message;
}

async function analyzeWithTools(system: string, user: string): Promise<string> {
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const max_iterations = 5;
  let iteration = 0;
  while (iteration < max_iterations) {
    iteration++;
    const message = await callAI(messages);
    messages.push(message);
    if (!message.tool_calls) {
      return message.content;
    }
    for (const call of message.tool_calls) {
      if (
        call.type === "function" &&
        call.function.name === "read_github_files"
      ) {
        console.log(`\nTool call: fetching ${call.function.name}`);
        let args;
        try {
          args = JSON.parse(call.function.arguments);
        } catch (e) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content:
              "Error: Could not parse tool arguments. Please try again with valid JSON.",
          });
          continue;
        }
        const result = await readGitHubFiles(args.files);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
    }
  }
  return "Error: max iterations reached without a final response.";
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

console.log(
  `Fetched diff (${diff.length} chars) and ${comments.length} comments`,
);

const { system, user } = buildPrompt(diff, comments, parsed.owner, parsed.repo);
const report = await analyzeWithTools(system, user);
console.log("\n" + report);
