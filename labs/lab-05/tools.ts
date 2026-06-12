interface GitHubFile {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export async function readGitHubFiles(files: GitHubFile[]): Promise<string> {
  const results: string[] = [];
  for (const file of files) {
    const url = `https://raw.githubusercontent.com/${file.owner}/${file.repo}/refs/heads/${file.ref}/${file.path}`;
    const response = await fetch(url);
    if (!response.ok) {
      return `Error: Could not fetch ${file.path} - status ${response.status}`;
    }
    const content = await response.text();
    const lines = content.split("\n");
    let finalContent = content;
    if (lines.length > 1000) {
      finalContent =
        lines.slice(0, 1000).join("\n") +
        `\n[File Truncated: showing first 1000 lines of ${lines.length} lines]`;
    }
    results.push(`## File: ${file.path}\n\n${finalContent}`);
  }
  return results.join("\n\n---\n\n");
}
