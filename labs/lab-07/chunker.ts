export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    heading: string;
    breadcrumb: string;
  };
}

function cleanMarkdown(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function chunkMarkdown(text: string, source: string): Chunk[] {
  const lines = cleanMarkdown(text).split("\n");
  const chunks: Chunk[] = [];

  let currentHeading = "Introduction";
  let breadcrumbs: string[] = [currentHeading];
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    const headingMatch = !inCodeBlock && line.match(/^(#{1,6})\s+(.*)/);

    if (headingMatch) {
      if (currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content.length > 50) {
          chunks.push({
            id: `${source}-${chunks.length}`,
            content: `${breadcrumbs.join(" > ")}\n\n${content}`,
            metadata: {
              source,
              heading: currentHeading,
              breadcrumb: breadcrumbs.join(" > "),
            },
          });
        }
      }

      const level = headingMatch[1]!.length;
      const title = headingMatch[2]!.trim();
      currentHeading = title;

      if (level === 1) {
        breadcrumbs = [title];
      } else {
        breadcrumbs = breadcrumbs.slice(0, level - 1);
        breadcrumbs.push(title);
      }

      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    chunks.push({
      id: `${source}-${chunks.length}`,
      content: `${breadcrumbs.join(" > ")}\n\n${currentContent.join("\n").trim()}`,
      metadata: {
        source,
        heading: currentHeading,
        breadcrumb: breadcrumbs.join(" > "),
      },
    });
  }

  return chunks;
}
