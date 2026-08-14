// src/cli.ts
import { encodeFile } from "./encode.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    process.stderr.write(
      "Usage: npx tsx src/cli.ts <file-path>\n" +
        "\n" +
        "Encodes a media file as a Base64 Data URI and prints it to stdout.\n" +
        "\n" +
        "Supported formats: png, jpg, jpeg, gif, webp, svg, mp3, wav, ogg, mp4, webm\n",
    );
    process.exit(1);
  }

  const filePath = args[0]!;

  try {
    const result = await encodeFile(filePath);
    process.stdout.write(result.raw + "\n");
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
