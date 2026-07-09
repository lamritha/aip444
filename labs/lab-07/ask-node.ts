import path from "path";
import { ChromaClient, type EmbeddingFunction } from "chromadb";
import OpenAI from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { OPENROUTER_API_KEY } = process.env;
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

class OpenRouterEmbeddingFunction implements EmbeddingFunction {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "openai/text-embedding-3-small") {
    this.model = model;
    this.openai = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  async generate(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: texts,
    });
    const sorted = response.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

async function rerank(
  query: string,
  candidates: any[],
  topN: number = 5,
): Promise<any[]> {
  const documents = candidates.map((c) => c.document);

  const response = await fetch("https://openrouter.ai/api/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "cohere/rerank-v3.5",
      query,
      documents,
      top_n: topN,
    }),
  });

  if (!response.ok) {
    throw new Error(`Rerank error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  return data.results.map((r: any) => ({
    ...candidates[r.index],
    rerankScore: r.relevance_score,
  }));
}

function buildPrompt(question: string, chunks: any[]): string {
  const docBlocks = chunks
    .map((chunk, i) => {
      return `<doc index="${i + 1}" source="${chunk.metadata.source}" breadcrumb="${chunk.metadata.breadcrumb}">
${chunk.document}
</doc>`;
    })
    .join("\n\n");

  return `You are ask-node, an expert Node.js assistant that answers questions about Node.js APIs.

Here is relevant context retrieved from the official Node.js documentation:

<context>
${docBlocks}
</context>

Instructions:
1. Answer the user's question based ONLY on the provided context above.
2. If the answer is not in the context, say "I don't have enough information to answer that based on the Node.js documentation."
3. Always cite which source file(s) you used (e.g., fs.md, crypto.md).
4. Be concise but complete.

Question: ${question}

Answer:`;
}

async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: npx tsx ask-node.ts "your question here"');
    process.exit(1);
  }

  const client = new ChromaClient({ host: "localhost", port: 8000 });
  const embeddingFunction = new OpenRouterEmbeddingFunction(
    OPENROUTER_API_KEY!,
  );

  const collection = await client.getCollection({
    name: "node-docs",
    embeddingFunction,
  });

  // 1. Retrieve top 25 from Chroma
  const results = await collection.query({
    queryTexts: [question],
    nResults: 25,
  });

  const candidates = results.ids[0]!.map((id, i) => ({
    id,
    document: results.documents[0]![i]!,
    metadata: results.metadatas[0]![i] as any,
    chromaSimilarity: 1 - results.distances![0]![i]!,
  }));

  // 2. Rerank to top 5
  const reranked = await rerank(question, candidates, 5);

  // 3. Print sources to stderr for transparency
  console.error("\n=== SOURCES RETRIEVED ===");
  reranked.forEach((r, i) => {
    console.error(
      `${i + 1}. [Rerank: ${r.rerankScore.toFixed(4)}] ${r.metadata.source} — ${r.metadata.breadcrumb}`,
    );
  });
  console.error("=========================\n");

  // 4. Build augmented prompt
  const prompt = buildPrompt(question, reranked);

  // 5. Send to LLM
  const response = await openai.chat.completions.create({
    model: "google/gemini-2.5-flash-lite",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  // 6. Print answer to stdout
  const answer =
    response.choices[0]?.message?.content ?? "No response generated.";
  console.log(answer);
}

main();
