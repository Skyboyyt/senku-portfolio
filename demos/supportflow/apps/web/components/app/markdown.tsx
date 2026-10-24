import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown renderer for article previews: headings, paragraphs, lists,
 * bold, italic, inline code and http(s) links. It builds React elements and never
 * injects HTML, so article content can't run scripts.
 */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const content = inline(heading[2]!);
      blocks.push(
        level <= 2 ? <h2 key={key++}>{content}</h2> : <h3 key={key++}>{content}</h3>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) {
        items.push(<li key={items.length}>{inline(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4})\s|^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) {
      para.push(lines[i]!);
      i++;
    }
    blocks.push(<p key={key++}>{inline(para.join(" "))}</p>);
  }
  return <div className="prose-sf">{blocks}</div>;
}

function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    if (token.startsWith("**")) parts.push(<strong key={n++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={n++} className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("*")) parts.push(<em key={n++}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("[")) {
      const label = /^\[([^\]]+)\]/.exec(token)![1];
      parts.push(<a key={n++} href={match[2]} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else parts.push(<a key={n++} href={token} target="_blank" rel="noopener noreferrer">{token}</a>);
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
