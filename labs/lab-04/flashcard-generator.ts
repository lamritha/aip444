import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { readFile } from 'fs/promises';
import { flashcardResponseSchema } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function generateFlashcards(notes: string, cards: number) {
  // 1. Load system prompt
  const systemPrompt = await readFile('./SYSTEM_PROMPT.md', 'utf-8');

  // 2. Call the API with structured output
  const completion = await client.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate ${cards} flashcards from the following notes:\n\n${notes}` },
    ],
    response_format: zodResponseFormat(flashcardResponseSchema, 'flashcards'),
  });

  // 3. Return the parsed structured data
  const raw = completion.choices[0].message.content;
  return JSON.parse(raw!);
}