# Assignment 2: Job Search Assistant

An end-to-end AI-powered job search assistant that analyzes the job market, evaluates your resume against real postings, and produces targeted application reports with legitimacy assessment, fit scoring, resume adaptation, cover letter guidance, and interview prep.

## System Overview

The system is organized into three phases:

- **Phase 1:** Ingests job posting PDFs, extracts structured data, researches companies, and produces a market analysis report
- **Phase 2:** Parses your resume, compares it against the market analysis, and produces a triaged gap analysis
- **Phase 3:** Takes a new job posting PDF and produces a comprehensive HTML application report via a web interface

## Setup

### Prerequisites

- Node.js v18+
- An [OpenRouter](https://openrouter.ai/) API key
- A [Tavily](https://app.tavily.com/) API key (free tier)

### Installation

```bash
cd assignments/assignment-02
npm install
```

### Environment Variables

Create a `.env` file at the root of the `aip444` project (two levels up from `assignment-02`) with:

```
OPENROUTER_API_KEY=your-openrouter-key-here
TAVILY_API_KEY=your-tavily-key-here
```

See `.env.example` for the required variables template.

---

## How to Run

### Phase 1: Job Market Analysis

Place your job posting PDFs in `data/jobs/`. Then run:

```bash
npm run phase1
```

With verbose debug logging:

```bash
npm run phase1 -- --verbose
```

**What it does:**

- Reads all PDFs from `data/jobs/`
- Skips any posting already extracted (existing `.json` file)
- Extracts structured data using LLM with structured outputs
- Researches each company using Tavily web search
- Generates market analysis JSON and Markdown report

**Outputs:**

- `data/jobs/<slug>.json` — one file per posting
- `data/analysis/market-analysis.json` — aggregated market data
- `reports/market-analysis.md` — human-readable market analysis

**Re-runnable:** Adding new PDFs and re-running will only process new postings. Delete a posting's `.json` file to force re-extraction.

---

### Phase 2: Resume Gap Analysis

```bash
npm run phase2 -- "path/to/your/resume.pdf"
```

With verbose debug logging:

```bash
npm run phase2 -- --verbose "path/to/your/resume.pdf"
```

**Requires:** Phase 1 must be run first (`data/analysis/market-analysis.json` must exist)

**What it does:**

- Extracts structured data from your resume PDF
- Compares your skills against market analysis from Phase 1
- Uses web search to find specific resources for addressing gaps
- Triages gaps into: quick wins, short-term, medium-term, long-term

**Outputs:**

- `data/resume/resume.json` — extracted resume data
- `data/analysis/gap-analysis.json` — structured gap analysis
- `reports/gap-analysis.md` — human-readable gap analysis report

**Re-runnable:** If `data/resume/resume.json` already exists, extraction is skipped. Delete it to force re-extraction.

---

### Phase 3: Application Advisor

```bash
npm run phase3
```

With verbose debug logging:

```bash
npm run phase3:verbose
```

**Requires:** Phase 1 and Phase 2 must be run first.

Then open your browser and go to:

```
http://localhost:3000
```

**What it does:**

1. Upload any job posting PDF via the web interface
2. Click "Analyze"
3. The system extracts the posting, runs a legitimacy assessment (WHOIS + web search), calculates fit score, and generates resume/cover letter/interview guidance
4. The full HTML report is displayed in the browser and saved to `reports/application-report.html`

**Outputs:**

- `reports/application-report.html` — full application report

---

## How to Run the Evaluation

The evaluation files are pre-populated with manual spot-checks and analysis:


| File                            | Description                                                   |
| ------------------------------- | ------------------------------------------------------------- |
| `eval/extraction-spot-check.md` | Manual verification of extraction accuracy for 2 postings     |
| `eval/scoring-check.md`         | Fit score verification for strong and weak fit postings       |
| `eval/legitimacy-check.md`      | Legitimacy agent tested on legitimate and suspicious postings |
| `eval/failure-analysis.md`      | Documented failures and overall system assessment             |


---

## Project Structure

```text
assignment-02/
├── README.md
├── .env.example
├── src/
│   ├── phase1.ts              # Job market analysis CLI
│   ├── phase2.ts              # Resume gap analysis CLI
│   └── phase3/
│       ├── server.ts          # Express web server
│       ├── advisor.ts         # Core analysis logic
│       ├── legitimacy.ts      # Legitimacy agent
│       └── public/
│           └── index.html     # Frontend upload page
├── data/
│   ├── jobs/                  # Extracted job posting JSONs
│   ├── resume/                # Extracted resume JSON
│   └── analysis/              # Market and gap analysis JSONs
├── reports/                   # Generated Markdown and HTML reports
├── eval/                      # Evaluation files
└── docs/
    └── reflection.md          # Written reflection
```

## Models Used

- **Extraction & Analysis:** `google/gemini-2.5-flash-lite` via OpenRouter
- **Embeddings:** None (keyword-based matching)
- **Web Search:** Tavily Search API
- **WHOIS Lookup:** `whois-json` npm package

## Notes

- Job posting PDFs collected from LinkedIn may have truncated descriptions due to LinkedIn's login wall. For best extraction quality, use PDFs from Indeed or other job boards that show full descriptions without login.
- Salary data is extracted as-is from postings. Mixed formats (hourly/monthly/annual) are not normalized, so the average salary in the market analysis should be interpreted carefully.
- The Phase 3 server may show a duplicate startup message — this is cosmetic and does not affect functionality.

