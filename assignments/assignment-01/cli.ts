interface CliOptions {
  debug: boolean;
  file: string | undefined;
  output: string | undefined;
}

export function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const file =
    args.indexOf("--file") !== -1
      ? args[args.indexOf("--file") + 1]
      : undefined;
  const output =
    args.indexOf("--output") !== -1
      ? args[args.indexOf("--output") + 1]
      : undefined;
  return { debug, file, output };
}
