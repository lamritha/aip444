import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export function serializeProduct(product: any): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(", ") : "";

  return [
    `Title: ${product.title}`,
    `Category: ${product.category}`,
    `Description: ${product.description}`,
    `Tags: ${tags}`,
    `Brand: ${product.brand ?? "N/A"}`,
  ].join(" | ");
}

export function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must be the same length");
  }
  return vecA.reduce((sum, val, i) => sum + val * vecB[i]!, 0);
}

export async function loadDatabase(): Promise<any[]> {
  const productsData = await readFile("products.json", "utf-8");
  const products = JSON.parse(productsData);

  const vectorsData = await readFile("vectors.tsv", "utf-8");
  const lines = vectorsData.trim().split("\n");

  if (products.length !== lines.length) {
    throw new Error(
      `Mismatch: ${products.length} products but ${lines.length} vector lines`,
    );
  }

  return products.map((product: any, index: number) => {
    const vector = lines[index]!.split("\t").map(Number);
    return { ...product, embedding: vector };
  });
}

export async function embedText(text: string): Promise<number[]> {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  return data.data[0].embedding;
}

export async function searchProducts(
  query: string,
  products: any[],
  minScore: number = 0.18,
): Promise<any[]> {
  const queryEmbedding = await embedText(query);

  const scored = products.map((product) => ({
    ...product,
    vectorScore: dotProduct(queryEmbedding, product.embedding),
  }));

  scored.sort((a, b) => b.vectorScore - a.vectorScore);

  const filtered = scored.filter((p) => p.vectorScore >= minScore);

  const candidates = filtered.slice(0, 20);

  if (candidates.length === 0) return [];

  return await rerankResults(query, candidates);
}

export async function rerankResults(
  query: string,
  candidates: any[],
  topN: number = 5,
): Promise<any[]> {
  const documents = candidates.map((p) => serializeProduct(p));

  const response = await fetch("https://openrouter.ai/api/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
    const error = await response.text();
    throw new Error(`Rerank error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as any;

  return data.results
    .filter((r: any) => r.relevance_score >= 0.1)
    .map((r: any) => ({
      ...candidates[r.index],
      rerankScore: r.relevance_score,
    }));
}
