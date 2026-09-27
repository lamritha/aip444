/**
 * -------------------------------------------------------------
 * Flashcard Generator API Server
 * -------------------------------------------------------------
 * This file creates a simple backend server using Hono.
 *
 * The server:
 * - Sets up middleware like logging, timing, and CORS.
 * - Accepts POST requests at /api/generate.
 * - Validates the incoming JSON data using Zod.
 * - Calls the generateFlashcards() function to create flashcards.
 * - Returns the generated flashcards as a JSON response.
 * - Handles any server errors and sends a proper error message.
 *
 * The server runs locally on port 3000.
 * -------------------------------------------------------------
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import * as z from 'zod';

// Function that generates the flashcards
// Note: include explicit .js extension for ECMAScript module resolution (node16/nodenext)
import { generateFlashcards } from './flashcard-generator.js';

// Create the Hono app
const app = new Hono();

// Global infrastructure middleware which runs on every request before any route logic
// logger() -> prints request info in the console
// timing() -> shows how long each request takes
app.use(logger(), timing());

// Enable CORS for all API routes
// This allows the frontend to communicate with the backend
app.use('/api/*', cors());

// Define what the incoming JSON should look like
const generateSchema = z.object({
  // Notes must exist and cannot be empty
  notes: z.string().min(1, "Field 'notes' is required."),

  // Number of flashcards to generate
  // Defaults to 3 if not provided
  cards: z.number().optional().default(3),
});

// API endpoint for generating flashcards
app.post('/api/generate', zValidator('json', generateSchema), async (c) => {
  try {
    // Zod has already validated the shape and types before this line runs and the handler only reaches here if the request passed the schema check
    const { notes, cards } = await c.req.valid('json');

    // Generate the flashcards
    const result = await generateFlashcards(notes, cards);

    // Send the generated flashcards back to the client
    return c.json(result);
  } // TypeScript types caught errors as `unknown` by default — `any` is used here to access error.message
  catch (error: any) {
    // Print the error in the server console
    console.error('Server Error:', error);

    // Developer-facing error payload, exposing error.message is fine in development, but should be stripped in production
    return c.json(
      {
        error: 'Failed to generate flashcards.',
        details: error.message,
      },
      500
    );
  }
});

// Port number for the server
const port = 3000;

// Display a message when the server starts
console.log(`🚀 Server running on http://localhost:${port}`);

// Start the server
serve({
  fetch: app.fetch,
  port,
});