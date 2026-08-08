# Failure Analysis & Overall Observations

## Failure 1: LinkedIn PDF Truncation Causing Sparse Skill Extraction

**What happened:** The first set of 12 job postings were collected from LinkedIn using "Print to PDF." LinkedIn hides full job descriptions behind a login wall, so the PDFs only captured the preview text ending with "...more". This caused required_skills and preferred_skills arrays to come back empty for most postings.

**Why it happened:** LinkedIn's web page rendering intentionally truncates descriptions for non-logged-in users. The PDF captured the rendered HTML state, not the full content. The LLM can only extract skills from text that is actually present in the PDF.

**What was done to fix it:** The postings were replaced with co-op/internship postings that had fuller descriptions visible before the truncation point. The extraction prompt was also improved to infer skills from job titles and any partial text visible.

**What would fix it permanently:** Use LinkedIn's official API or collect postings from Indeed, which shows full descriptions without login. Alternatively, implement a browser automation tool (Playwright) to log in and capture the full page before printing to PDF.

---

## Failure 2: Salary Normalization Produces Misleading Average

**What happened:** The market analysis report calculates an average salary of $26,854 CAD, which is meaningless because the raw salary values are in different formats: some are hourly ($20-39/hr), some are monthly ($3,600-$4,500/month), some are annual ($60,000-$80,000/year), and one is a weekly stipend ($1,200-$1,500/week).

**Why it happened:** The extraction schema stored salary as min/max numbers without normalizing to a common unit. The market analysis LLM averaged these raw numbers without accounting for the different time units.

**What would fix it:** Add a salary normalization step that converts all values to annual CAD equivalent before aggregating. For example: hourly × 40 hours × 52 weeks = annual. This would produce a meaningful comparable figure.

---

## Failure 3: Server Startup Message Prints Twice

**What happened:** The terminal shows "Job Application Advisor listening on http://localhost:3000" twice every time the server starts.

**Why it happened:** There is a duplicate `console.log` call in `server.ts` — likely introduced when Cursor generated the file and the startup confirmation was written in two places.

**What would fix it:** Remove the duplicate console.log line in server.ts.

---

## Failure 4: Quick Wins Initially Empty

**What happened:** On the first run of Phase 2, the Quick Wins section returned "No quick wins identified" even though the candidate had several skills already present that just needed better framing.

**Why it happened:** The initial prompt did not clearly distinguish between "skills to learn" and "framing improvements for existing skills." The LLM defaulted to treating all gaps as learning tasks.

**What was done to fix it:** The prompt was updated to explicitly define quick wins as framing changes for skills already present, with concrete examples. This produced 3 useful quick wins on the next run.

---

## Overall System Assessment

**What the system does well:**
- Company research via Tavily adds genuine value — culture signals, company size, recent news are accurate and useful
- Legitimacy assessment correctly identifies both legitimate and suspicious postings with specific evidence
- The fit score is consistently encouraging without being dishonest — gaps are listed but framed as minor
- Resume adaptation suggestions are specific and reference actual resume content, not generic advice
- The HTML report is visually polished and well-organized

**Where it falls short:**
- Heavily dependent on PDF quality — LinkedIn PDFs produce poor skill extraction compared to Indeed
- Salary normalization is broken for mixed-unit datasets
- No retry logic when LLM returns invalid structured output
- The gap analysis occasionally lists skills as gaps that are present in the resume (React was initially listed as a gap despite being in hard_skills)

**Would I trust this system in a real job search?** Yes, with caveats. The legitimacy assessment and company research are genuinely useful and would save significant manual research time. The fit score and resume adaptation are good starting points but should be reviewed critically — the LLM occasionally makes assumptions about resume content. The gap analysis is the most reliable section since it is grounded in concrete market data from 12 real postings.