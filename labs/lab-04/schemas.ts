import * as z from 'zod';

export const flashcardSchema = z.object({
  application: z.string().describe('1-2 sentence real-world workplace task where this concept is needed'),
  challenge: z.string().describe('A specific problem to solve in the scenario. Expand all acronyms'),
  answer: z.string().describe('Correct solution with brief explanation'),
  evidence: z.string().describe('Direct quote from source notes supporting this card'),
  misconception: z.string().describe('Quote of what a junior developer/student might incorrectly believe'),
  correction: z.string().describe("Why it's wrong, citing the notes"),
});

export const flashcardResponseSchema = z.object({
  flashcards: z.array(flashcardSchema).describe('List of generated flashcards'),
}).describe('Response object containing a list of generated flashcards');

export type Flashcard = z.infer<typeof flashcardSchema>;