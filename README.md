# AIP444: AI for Programmers

Labs and assignments from AIP444 (Seneca Polytechnic): command-line tools, a small HTTP API, retrieval-augmented generation (RAG), and tool-calling agents, built in JavaScript and TypeScript on top of LLMs accessed through [OpenRouter](https://openrouter.ai).

Each lab and assignment is its own npm package with its own dependencies.

## Contents

| Project | What it does | Stack |
|---|---|---|
| **Lab 01** `git-cm` | Reads your staged `git diff` and generates a Conventional Commit message (`--creative` for a Gitmoji style) | Node, OpenRouter |
| **Lab 02** `flashcard` | Turns a markdown notes file into flashcards from a system prompt (`--cards N`, 1 to 5) | Node, OpenRouter |
| **Lab 03** `pr-advice` | Takes a GitHub PR URL, fetches the diff and comments, and writes a Markdown review report with a single model call | TypeScript, OpenRouter |
| **Lab 04** Flashcard API | Hono server with `POST /api/generate` returning structured flashcards validated with Zod | TypeScript, Hono, Zod |
| **Lab 05** `pr-advice` with tools | Lab 03 plus a tool-calling loop (max 5 iterations) that fetches files from the repo when the diff isn't enough | TypeScript, function calling |
| **Lab 06** Product search | Embeds a product catalogue into a file-backed vector index, then does interactive semantic search with reranking | TypeScript, embeddings, Cohere rerank |
| **Lab 07** `ask-node` | RAG over Node.js documentation: heading-based chunking, Chroma vector store, rerank, answer with sources | TypeScript, Chroma |
| **Lab 08** `img-debug` | Compresses a screenshot, sends it to a vision model, and looks up the error through a Tavily search tool | TypeScript, sharp, Tavily |
| **Lab 09** Credibility agent | An agent (OpenAI Agents SDK) that investigates a URL using page reading and web search, then writes a Markdown report | TypeScript, Agents SDK, Tavily |
| **Lab 10** Data URI library | Encode and decode media to and from Data URIs, with a CLI and tests (no AI) | TypeScript, Vitest |
| **Assignment 01** Multi-reviewer code review | A Security Auditor and a Maintainability Critic run in parallel, each with its own tool-calling loop; a third call, the Judge, merges and dedupes their findings into an HTML report | TypeScript, Zod |
| **Assignment 02** Job search assistant | Phase 1 analyses job postings, phase 2 runs a resume gap analysis, phase 3 is an Express upload UI that produces an HTML application report and checks posting legitimacy | TypeScript, Express, Tavily |

## How the more involved projects work

**ask-node (Lab 07).** Markdown docs are split on headings (chunks under 50 characters are skipped, and each chunk gets a heading breadcrumb) and embedded with `openai/text-embedding-3-small` into a Chroma collection using cosine similarity. A question retrieves 25 candidates, `cohere/rerank-v3.5` keeps the top 5, and Gemini answers from those chunks. Sources print to stderr and the answer to stdout.

**Multi-reviewer review (Assignment 01).** The two reviewers run concurrently with `Promise.all`. Each returns JSON issues that conform to a schema. The Security Auditor can call `read_file` and `ripgrep`, and the Maintainability Critic can call `read_file`. The Judge is a separate model call that synthesises both outputs into one HTML report.

**Product search (Lab 06).** Vector scores use a dot product over normalised embeddings, with a minimum score cut-off. The top 20 are reranked and the best 5 are returned.

## Setup

Requires Node.js 18 or later.

1. Clone the repo and create a `.env` file in the repository root:

   ```
   OPENROUTER_API_KEY=your_key_here
   TAVILY_API_KEY=your_key_here
   ```

   `TAVILY_API_KEY` is only needed for Lab 08, Lab 09, and Assignment 02. Lab 10 needs no keys.

2. Install dependencies inside the project you want to run:

   ```bash
   cd labs/lab-03
   npm install
   ```

## Running each project

| Project | Command |
|---|---|
| Lab 01 | `node git-cm.js` (stage changes first; add `--creative` for the alternate style) |
| Lab 02 | `node flashcard.js notes/week3.md --cards 3` |
| Lab 03 / 05 | `npx tsx pr-advice.ts <github-pr-url>` |
| Lab 04 | `npm run dev`, then `node test-client.js` |
| Lab 06 | `npx tsx indexer.ts`, then `npx tsx search.ts` |
| Lab 07 | see the note below, then `npx tsx indexer.ts` and `npx tsx ask-node.ts "your question"` |
| Lab 08 | `npx tsx img-debug.ts ./screenshot.png` |
| Lab 09 | `npx tsx agent.ts https://example.com/article` |
| Lab 10 | `npm test`, or `npx tsx src/cli.ts <file>` |
| Assignment 01 | `node --loader ts-node/esm main.ts --file bad_code.ts` (options: `--debug`, `--output out.html`) |
| Assignment 02 | `npm run phase1`, then `npm run phase2`, then `npm run phase3` (opens at `http://localhost:3000`) |

**Lab 07 prerequisites.** A Chroma server must be running on `localhost:8000`, and the Node.js documentation as Markdown files must be placed in `labs/lab-07/docs/`. Neither is included in the repo. [Add the exact command you use to start Chroma.]

**Assignment 02 data.** Add your own resume PDF and job posting files under `assignments/assignment-02/data/`. No personal data or sample postings are included in the repo.

## Models used

Models are called by ID through OpenRouter, so they can be swapped by changing a string. IDs currently referenced in the code include `google/gemini-2.5-flash-lite`, `google/gemini-2.5-flash`, `openai/gpt-4o-mini`, `openai/text-embedding-3-small`, `cohere/rerank-v3.5`, and `anthropic/claude-haiku-4.5`. Labs 01 and 02 also list free-tier fallback models.

## Testing

Only Lab 10 has an automated test suite (Vitest, `npm test`). The other projects have no automated tests and were checked by running them manually.

## Known limitations

- Lab 07 can't run from a fresh clone without a Chroma server and the docs folder
- No tool is installed as a global command; everything runs through `node`, `npx tsx`, or npm scripts
- Most labs have no `npm run` scripts
- Model IDs and API endpoints are hardcoded in each project
