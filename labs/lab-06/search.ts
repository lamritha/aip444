import * as readline from "readline";
import { loadDatabase, searchProducts } from "./utils.js";

async function main() {
  console.log("Loading product database...");
  const products = await loadDatabase();
  console.log(`Loaded ${products.length} products\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  console.log('Type your search query, or "exit" to quit.\n');

  while (true) {
    const query = await ask("What are you looking for? ");

    if (query.toLowerCase() === "exit") {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    if (!query.trim()) continue;

    console.log("\nSearching...\n");

    const results = await searchProducts(query, products);

    if (results.length === 0) {
      console.log("I'm sorry, we don't have anything like that in stock.\n");
      continue;
    }

    console.log(`Found ${results.length} matches:`);
    results.forEach((product, index) => {
      const rerank = product.rerankScore?.toFixed(4) ?? "N/A";
      const vector = product.vectorScore?.toFixed(4) ?? "N/A";
      console.log(
        `${index + 1}. [Rerank: ${rerank} | Vector: ${vector}] ${product.title} - $${product.price}`,
      );
    });

    console.log();
  }
}

main();
