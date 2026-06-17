export interface Issue {
  path: string;
  line: number;
  severity: string;
  category: string;
  description: string;
}

export const responseSchema = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      description: "List of issues found during the code review",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The file path where the issue was found, e.g. 'src/utils/auth.ts'",
          },
          line: {
            type: "number",
            description: "The line number in the file where the issue occurs",
          },
          severity: {
            type: "string",
            enum: ["info", "warn", "critical"],
            description:
              "How serious this issue is. Use 'critical' for security vulnerabilities or bugs that will break functionality, 'warn' for issues that should be fixed but aren't urgent, and 'info' for minor suggestions or style notes.",
          },
          category: {
            type: "string",
            description:
              "The type of issue, e.g. 'security', 'style', 'naming', 'performance', 'maintainability'",
          },
          description: {
            type: "string",
            description:
              "A clear explanation of the issue and a concrete suggestion for how to fix it",
          },
        },
        required: ["path", "line", "severity", "category", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
};
