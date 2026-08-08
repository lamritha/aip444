# Extraction Spot-Check

## Posting 1: Software Engineer Intern (Fall/Winter 2026) — Cohere

Manual inspection before running extractor:

| Field | Expected | Extracted | Correct? |
|:------|:---------|:----------|:---------|
| Job title | Software Engineer Intern | Software Engineer Intern | ✅ |
| Company | Cohere | Cohere | ✅ |
| Location | Canada (Remote) | Canada | ✅ |
| Remote status | remote | remote | ✅ |
| Salary | Not listed | CA$0 | ✅ |
| posting_age_days | 7 | 7 | ✅ |
| Required skills | Python, ML, distributed systems | Python, AI, distributed systems | ✅ |
| Experience level | Intern/student | not specified | ❌ |
| Education requirements | CS/Engineering enrollment | not specified | ❌ |

**Summary:** Company, location, remote status, and core skills were correctly extracted. Experience level and education were missed because the LinkedIn PDF truncated the full description. Salary showing CA$0 is accurate — Cohere did not list compensation.

---

## Posting 2: Software Development Co-op Student (Fall 2026) — TechInsights

Manual inspection before running extractor:

| Field | Expected | Extracted | Correct? |
|:------|:---------|:----------|:---------|
| Job title | Software Development Co-op Student | Software Development Co-op Student | ✅ |
| Company | TechInsights | TechInsights | ✅ |
| Location | Toronto, ON | Toronto, ON | ✅ |
| Remote status | hybrid | hybrid | ✅ |
| Salary | $20-25/hour CAD | $20-25/hour CAD | ✅ |
| posting_age_days | 14 | 14 | ✅ |
| Required skills | Python, SQL, JavaScript, React, Git | Python, SQL, JavaScript, React, Git | ✅ |
| Experience level | Co-op student | student | ✅ |
| Education requirements | CS/Engineering enrollment | not specified | ❌ |

**Summary:** TechInsights had the most complete LinkedIn PDF of the 12 postings, resulting in 26 required skills extracted — the highest count in the dataset. Education requirements were still missed. Salary was correctly extracted as an hourly range.

---

## Overall Extractor Assessment

**What worked well:**
- Company name, job title, location, and remote status were accurate across all 12 postings
- Salary extraction worked for 9/12 postings that included compensation
- Company research via Tavily added useful context not present in truncated PDFs
- posting_age_days was correctly calculated from LinkedIn's relative date format

**What was missed:**
- Education requirements were rarely extracted due to LinkedIn PDF truncation
- Experience level was often returned as "not specified" even when implied
- Required skills were sparse in early LinkedIn PDFs — resolved by switching to co-op postings with fuller descriptions