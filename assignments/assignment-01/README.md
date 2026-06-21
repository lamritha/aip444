# AI Code Review CLI

A command-line tool that performs automated code reviews using multiple AI reviewer "personas" running in parallel, synthesized into a single HTML report by a "Lead Developer" judge model.

## Overview

This tool reviews either a git diff of staged changes or a single file, using two specialized AI reviewers:

- **Security Auditor** — scans for hardcoded secrets, injection vulnerabilities, and missing permission checks. Has access to `read_file` and `ripgrep`.
- **Maintainability Critic** — scans for unclear naming, overly long functions, unused imports, and duplicated logic. Has access to `read_file`.

Both reviewers run **in parallel** and return structured JSON findings. A third model, the **Lead Developer (Judge)**, reads both sets of findings, de-duplicates and filters them, resolves any conflicts, and writes a final HTML report.

## Setup

```bash
npm install
```

Requires an `OPENROUTER_API_KEY` in a `.env` file at the repository root (two levels up from this folder).

## Usage

### File Mode

Review a single file directly:

```bash
node --loader ts-node/esm main.ts --file bad_code.ts
```

### Git Mode

Review your currently staged changes (default mode, no flag needed):

```bash
git add <files>
node --loader ts-node/esm main.ts
```

### Debug Mode

Add `--debug` to either mode to print detailed logs to `stderr` — including which tools each reviewer calls, the arguments passed, the tool results, and the raw JSON each reviewer returns before synthesis.

```bash
node --loader ts-node/esm main.ts --debug --file bad_code.ts
```

### Custom Output Filename

```bash
node --loader ts-node/esm main.ts --file bad_code.ts --output my-report.html
```

If `--output` is omitted, the report is saved as `review-DD-MM-YYYY-HH-MM-SS.html`.

## Project Structure

| File             | Purpose                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `cli.ts`         | Parses command-line flags (`--debug`, `--file`, `--output`)                         |
| `tools.ts`       | Implements `read_file` and `ripgrep`, the two tools available to reviewers          |
| `toolSchemas.ts` | JSON Schema definitions describing the tools to the LLM                             |
| `schema.ts`      | The `Issue` type and JSON Schema used to force structured output from each reviewer |
| `prompts.ts`     | System prompts for the Security Auditor, Maintainability Critic, and Judge          |
| `input.ts`       | Builds the review input from either `git diff --staged` or a specified file         |
| `reviewer.ts`    | The tool-calling loop that runs a single reviewer to completion                     |
| `judge.ts`       | Calls the Judge model to synthesize both reviewers' findings into HTML              |
| `main.ts`        | Entry point — wires everything together and writes the final report                 |
| `bad_code.ts`    | Sample file with intentional issues, used to test the golden dataset                |

## How It Works

1. **Input** — the tool determines whether it's reviewing a file or a git diff.
2. **Parallel Review** — both reviewers run simultaneously via `Promise.all`, each with its own system prompt and tool access. Each can call `read_file` or `ripgrep` (Security only) to gather more context before answering, and must return structured JSON matching a strict schema.
3. **Synthesis** — the Judge receives both reviewers' JSON output, removes duplicates, filters out low-value nitpicks, and produces a single styled HTML report grouped by severity.
4. **Output** — the HTML report is written to disk and its path is printed to the console.

## Model

Both reviewers and the Judge use `google/gemini-2.5-flash` via OpenRouter.
