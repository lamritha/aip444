# Lab 8: img-debug — A Visual Debugger

A CLI tool that takes a screenshot of a technical error, optimizes it, analyzes it using a vision-capable LLM, and searches the web for current documentation and fixes.

## How it works

1. Loads and compresses your screenshot (resized to 1024px max, converted to JPEG at 85% quality)
2. Sends the optimized image to a vision-capable LLM via OpenRouter
3. If the model identifies a specific error or library, it automatically searches the web using Tavily
4. Returns a structured debug report with root cause, fix, and cited sources

## Prerequisites

- Node.js v18+
- An [OpenRouter](https://openrouter.ai/) API key
- A [Tavily](https://app.tavily.com/) API key (free tier — 1,000 searches/month)

## Installation

```bash
npm install
```

This installs all required dependencies:

- `openai` — OpenAI SDK used to call OpenRouter's API
- `sharp` — Fast image processing library for resizing and compressing screenshots before sending to the API
- `@tavily/core` — Tavily search SDK for web lookups
- `dotenv` — Loads environment variables from `.env`

## Environment Variables

Add the following to your `.env` file (located at the root of the `aip444` project):

```
OPENROUTER_API_KEY=your-openrouter-key-here
TAVILY_API_KEY=your-tavily-key-here
```

## Usage

```bash
npx tsx img-debug.ts <path-to-screenshot>
```

**Example:**

```bash
npx tsx img-debug.ts ./error-screenshot.png
```

The tool accepts `.png`, `.jpg`, `.jpeg`, and `.webp` files.

Debug info (image sizes, search queries) is printed to `stderr`.
The final analysis is printed to `stdout`.

## Example Output

```
Original size: 89.74 KB
Processed size: 41.44 KB
Base64 size: 55.25 KB
Looking up: TypeError: Cannot read properties of null nodejs

## Step 3: Analyze
...

## Step 4: Fix
...

## Step 5: Sources
1. https://stackoverflow.com/...
```
