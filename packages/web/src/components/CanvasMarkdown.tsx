"use client";

import { Fragment, type ReactNode } from "react";
import type { CanvasArtifact } from "@aoagents/ao-core";

type Props = { canvas: Extract<CanvasArtifact, { type: "markdown" }> };

export function CanvasMarkdown({ canvas }: Props) {
  return (
    <div className="text-sm leading-relaxed text-[var(--color-text-primary)]">
      {renderMarkdown(canvas.payload.markdown)}
    </div>
  );
}

// Minimal markdown subset: ATX headings (# .. ######), fenced code blocks
// (``` … ```), unordered list groups (- / *), paragraphs, and inline formatting
// (**bold**, *italic*, `code`). Plain-text only — no HTML pass-through, so user
// content can't inject markup. Heavier markdown features (tables, links, images,
// nested lists) are out of scope; agents that need them can ship a `table` or
// `diff` canvas type instead.
function renderMarkdown(input: string): ReactNode[] {
  const lines = input.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded bg-[var(--color-bg-elevated)] p-2 font-mono text-xs"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const text = heading[2] ?? "";
      const sizes = ["text-lg", "text-base", "text-sm", "text-sm", "text-sm", "text-sm"];
      blocks.push(
        <p key={key++} className={`mb-1 mt-2 font-semibold ${sizes[level - 1]}`}>
          {renderInline(text)}
        </p>,
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 list-disc pl-5">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !(lines[i] ?? "").startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "")
    ) {
      buf.push(lines[i] ?? "");
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2">
        {renderInline(buf.join(" "))}
      </p>,
    );
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  // Tokens: **bold**, *italic*, `code`. Plain text fills the gaps. No HTML
  // escaping needed — React renders strings as text nodes.
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>);
    const tok = match[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={key++} className="rounded bg-[var(--color-bg-elevated)] px-1 font-mono text-xs">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={key}>{text.slice(last)}</Fragment>);
  return out;
}
