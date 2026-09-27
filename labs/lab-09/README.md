# Lab 9: Source Credibility Analyzer Agent

An autonomous agent that investigates and evaluates the credibility of any URL. Given a source, the agent reads the page, investigates the author and publication, verifies key claims against other sources, and produces a structured Markdown credibility report.

## How it works

The agent follows a 7-step investigative process:
1. Reads the source URL
2. Investigates the author's credentials
3. Investigates the publication's reputation
4. Verifies key claims against other sources
5. Checks for bias indicators
6. Records a structured credibility assessment
7. Writes a full Markdown report to disk

## Prerequisites

- Node.js v18+
- An [OpenRouter](https://openrouter.ai/) API key
- A [Tavily](https://app.tavily.com/) API key (free tier)

## Installation

```bash
npm install
```

This installs all required dependencies:
- `@openai/agents` — OpenAI Agents SDK for the agentic loop and tool orchestration
- `@tavily/core` — Tavily search SDK for web lookups during investigation
- `zod` — Schema validation for the structured credibility assessment tool
- `dotenv` — Loads environment variables from `.env`

## Environment Variables

Add the following to your `.env` file at the root of the `aip444` project:

```
OPENROUTER_API_KEY=your-openrouter-key-here
TAVILY_API_KEY=your-tavily-key-here
```

## Usage

```bash
npx tsx agent.ts <url>
```

**Example:**

```bash
npx tsx agent.ts https://www.bbc.com/news/science-environment-56901261
```

The agent will run for up to 20 turns, printing each tool call to stderr as it works. When finished, it prints a summary to stdout and saves a full Markdown report to the current directory.

## Output

- **Terminal:** Live trace showing every tool call (read_url, web_search, assess_credibility, save_report)
- **Report file:** A `.md` file saved to `labs/lab-09/` named after the domain (e.g. `credibility-report-bbc-cop26.md`)

## Credibility Ratings

The agent rates sources on a four-point scale:
- `high` — Reliable, well-corroborated, transparent
- `medium` — Useful but has limitations (promotional content, bias, etc.)
- `low` — Significant credibility concerns
- `very_low` — Do not use as a source

## Tools

| Tool | Purpose |
|------|---------|
| `read_url` | Fetches page content via Jina Reader API |
| `web_search` | Searches the web via Tavily for author/claim verification |
| `assess_credibility` | "Think" tool — forces structured evaluation before reporting |
| `save_report` | Writes the final Markdown report to disk |