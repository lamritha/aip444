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

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: npx tsx query.ts "your question here"');
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

  console.log(`\nQuery: "${query}"\n`);
  console.log("Searching Chroma for top 25...\n");

  const results = await collection.query({
    queryTexts: [query],
    nResults: 25,
  });

  // Flatten into usable array
  const candidates = results.ids[0]!.map((id, i) => ({
    id,
    document: results.documents[0]![i]!,
    metadata: results.metadatas[0]![i] as any,
    chromaDistance: results.distances![0]![i]!,
    chromaSimilarity: 1 - results.distances![0]![i]!,
  }));

  console.log("Reranking to top 5...\n");
  const reranked = await rerank(query, candidates, 5);

  console.log("=== RESULTS ===\n");
  reranked.forEach((r, i) => {
    console.log(
      `${i + 1}. [Rerank: ${r.rerankScore.toFixed(4)} | Similarity: ${r.chromaSimilarity.toFixed(4)}]`,
    );
    console.log(`   Source: ${r.metadata.source}`);
    console.log(`   Breadcrumb: ${r.metadata.breadcrumb}`);
    console.log(`   Preview: ${r.document.slice(0, 120)}...`);
    console.log();
  });
}

main();
