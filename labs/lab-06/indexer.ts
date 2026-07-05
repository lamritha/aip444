import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { writeFile } from "fs/promises";
import { serializeProduct } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function fetchProducts(): Promise<any[]> {
  console.log("Fetching products...");
  const response = await fetch("https://dummyjson.com/products?limit=200");
  const data = (await response.json()) as any;
  console.log(`Fetched ${data.products.length} products`);
  return data.products;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  console.log(`Embedding ${texts.length} products...`);

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: texts,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as any;
  // Sort by index to ensure order matches our products array
  data.data.sort((a: any, b: any) => a.index - b.index);
  return data.data.map((item: any) => item.embedding);
}

async function main() {
  const products = await fetchProducts();

  await writeFile("products.json", JSON.stringify(products, null, 2));
  console.log("Saved products.json");

  const serialized = products.map(serializeProduct);

  const embeddings = await embedTexts(serialized);

  const vectorLines = embeddings.map((vec) => vec.join("\t"));
  await writeFile("vectors.tsv", vectorLines.join("\n"));
  console.log("Saved vectors.tsv");

  const metadataLines = ["Title\tCategory"];
  for (const product of products) {
    const title = product.title.replace(/\t/g, " ").replace(/\n/g, " ");
    const category = product.category.replace(/\t/g, " ").replace(/\n/g, " ");
    metadataLines.push(`${title}\t${category}`);
  }
  await writeFile("metadata.tsv", metadataLines.join("\n"));
  console.log("Saved metadata.tsv");

  console.log("\nIndexing complete!");
}

main();
