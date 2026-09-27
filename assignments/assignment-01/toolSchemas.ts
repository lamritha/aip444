export const readFileTool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Read a file from the local filesystem. Use this to see more context around a code change than the diff alone shows — for example, to see imports, surrounding functions, or class definitions.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "The path to the file, relative to the project root, e.g. 'src/utils/auth.ts'",
        },
        start_line: {
          type: "number",
          description:
            "Optional. The line number to start reading from (1-indexed). Omit to start from the beginning of the file.",
        },
        end_line: {
          type: "number",
          description:
            "Optional. The line number to stop reading at (inclusive). Omit to read up to 1000 lines from the start.",
        },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
  },
};

export const ripgrepTool = {
  type: "function",
  function: {
    name: "ripgrep",
    description:
      "Search the entire codebase recursively for a text pattern. Use this to find where a function is defined, how it's used elsewhere, or to check if a suspicious pattern (e.g. a hardcoded secret) appears in multiple places.",
    parameters: {
      type: "object",
      properties: {
        search_pattern: {
          type: "string",
          description:
            "The text pattern to search for, e.g. a function name, variable name, or suspicious string.",
        },
      },
      required: ["search_pattern"],
      additionalProperties: false,
    },
  },
};
