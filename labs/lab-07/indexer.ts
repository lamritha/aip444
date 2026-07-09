import path from "path";
import fs from "fs/promises";
import { ChromaClient, type EmbeddingFunction } from "chromadb";
import OpenAI from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { chunkMarkdown } from "./chunker.js";

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

const client = new ChromaClient({ host: "localhost", port: 8000 });
const embeddingFunction = new OpenRouterEmbeddingFunction(OPENROUTER_API_KEY);

async function main() {
  const collection = await client.getOrCreateCollection({
    name: "node-docs",
    embeddingFunction,
    configuration: {
      hnsw: { space: "cosine" },
    },
  });

  console.log("Collection ready. Starting indexing...\n");

  const docsDir = path.join(__dirname, "docs");
  const files = await fs.readdir(docsDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  console.log(`Found ${mdFiles.length} markdown files\n`);

  for (const file of mdFiles) {
    console.log(`Processing ${file}...`);
    const text = await fs.readFile(path.join(docsDir, file), "utf-8");

    const chunks = chunkMarkdown(text, file);
    if (chunks.length === 0) {
      console.log(`  No chunks found, skipping`);
      continue;
    }

    console.log(`  ${chunks.length} chunks`);

    const ids = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.content);
    const metadatas = chunks.map((c) => c.metadata);

    await collection.upsert({ ids, documents, metadatas });
  }

  console.log("\nIndexing complete!");
}

main();
