export interface Chunk {
  heading: string;
  content: string;
}

const TARGET_CHARS = 900;
const MAX_CHARS = 1400;

/**
 * Splits a Markdown article into retrieval chunks. Each heading starts a section; long
 * sections are split on paragraph boundaries. Every chunk carries the nearest heading so
 * it still makes sense on its own.
 */
export function chunkArticle(title: string, body: string): Chunk[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: title, lines: [] }];
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1]) {
      sections.push({ heading: `${title} — ${match[1].trim()}`, lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const paragraphs = section.lines
      .join("\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    let current = "";
    const flush = () => {
      if (current.trim()) chunks.push({ heading: section.heading, content: current.trim() });
      current = "";
    };
    for (const paragraph of paragraphs) {
      if (paragraph.length > MAX_CHARS) {
        flush();
        for (const piece of splitLong(paragraph)) chunks.push({ heading: section.heading, content: piece });
        continue;
      }
      if (current && current.length + paragraph.length + 2 > TARGET_CHARS) flush();
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    flush();
  }
  return chunks;
}

function splitLong(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > TARGET_CHARS) {
      pieces.push(current);
      current = "";
    }
    if (sentence.length > MAX_CHARS) {
      for (let i = 0; i < sentence.length; i += TARGET_CHARS) pieces.push(sentence.slice(i, i + TARGET_CHARS));
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Splits an imported document into articles on top-level (#) headings. Text before the
 * first heading becomes an article titled after the file.
 */
export function splitImport(filename: string, content: string): { title: string; body: string }[] {
  const fallbackTitle =
    filename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Imported article";
  const articles: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1]) {
      current = { title: match[1].trim(), lines: [] };
      articles.push(current);
    } else {
      if (!current) {
        current = { title: fallbackTitle, lines: [] };
        articles.push(current);
      }
      current.lines.push(line);
    }
  }
  return articles
    .map((a) => ({ title: a.title.slice(0, 200), body: a.lines.join("\n").trim() }))
    .filter((a) => a.body.length > 0 && a.title.length >= 3);
}
