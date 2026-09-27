# AGENTS.md

## Project

A utility library for encoding and decoding media files
as Base64 Data URIs. Supports common image, audio, and
video formats.

## Tech Stack

- TypeScript with strict mode
- Zod for validation
- Vitest for testing

## Structure

- `src/` — Library source code
- `tests/` — Test files
- `tests/fixtures/` — Small sample media files for testing

## Commands

- `npm test` — Run all tests
- `npm run typecheck` — Check types

## Conventions

- All public functions must have JSDoc comments
- All exported types must use Zod schemas
- Handle errors explicitly — never silently swallow failures
- Run tests before considering any task complete
- Keep functions small and focused — one job per function
- SVG is text-based, not binary — handle it differently from PNG/JPEG
