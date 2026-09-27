import { appendFileSync } from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { analyzeApplication } from "./advisor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DEBUG_LOG_PATH = path.join(ROOT_DIR, "debug.log");

if (process.argv.includes("--verbose")) {
  const origWrite = process.stderr.write.bind(process.stderr);
  (process as any).stderr.write = (...args: any[]) => {
    process.stdout.write(...args);
    return origWrite(...args);
  };

  const appendDebugLine = (text: string): void => {
    if (!text.includes("[DEBUG]")) return;
    const line = text.endsWith("\n") ? text : `${text}\n`;
    appendFileSync(DEBUG_LOG_PATH, line);
  };

  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    appendDebugLine(args.map(String).join(" "));
    origLog(...args);
  };

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    appendDebugLine(args.map(String).join(" "));
    origError(...args);
  };
}

// Same env loading pattern as phase1.ts (paths relative to src/)
const srcDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(srcDir, "../../.env") });
if (!process.env.OPENROUTER_API_KEY || !process.env.TAVILY_API_KEY) {
  dotenv.config({ path: path.resolve(srcDir, "../../../.env") });
}

const { OPENROUTER_API_KEY, TAVILY_API_KEY } = process.env;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in ../../.env");
  process.exit(1);
}

if (!TAVILY_API_KEY) {
  console.error("Missing TAVILY_API_KEY in ../../.env");
  process.exit(1);
}

const VERBOSE =
  process.argv.includes("--verbose") || process.argv.includes("--debug");

function debug(message: string): void {
  if (VERBOSE) {
    console.log(`[DEBUG] ${message}`);
  }
}

const TEMP_DIR = path.join(ROOT_DIR, "data", "temp");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = 3000;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function start(): Promise<void> {
  await mkdir(TEMP_DIR, { recursive: true });

  const app = express();
  app.use(express.static(PUBLIC_DIR));

  app.post("/analyze", (req, res) => {
    upload.single("pdf")(req, res, async (uploadErr) => {
      if (uploadErr) {
        console.error(`[ERROR] Upload failed: ${uploadErr.message}`);
        res.status(400).json({ error: uploadErr.message });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: "No PDF file uploaded. Use form field name 'pdf'.",
        });
        return;
      }

      const sizeKb = Math.round(file.size / 1024);
      debug(`Received PDF: ${file.originalname} (${sizeKb} KB)`);

      try {
        const html = await analyzeApplication(file.path, {
          openrouterApiKey: OPENROUTER_API_KEY,
          tavilyApiKey: TAVILY_API_KEY,
        });
        res.type("html").send(html);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] Analyze failed: ${msg}`);
        res.status(500).json({ error: msg });
      } finally {
        try {
          await unlink(file.path);
        } catch {
          // ignore cleanup failures
        }
      }
    });
  });

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(`[ERROR] ${err.message}`);
      res.status(500).json({ error: err.message || "Internal server error" });
    },
  );

  app.listen(PORT, () => {
    console.error(
      `Job Application Advisor listening on http://localhost:${PORT}`,
    );
    if (VERBOSE) {
      console.log("[DEBUG] Verbose mode enabled");
    }
  });
}

start().catch((error) => {
  console.error(
    `[FATAL] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
