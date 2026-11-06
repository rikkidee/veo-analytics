import { createElement, type CSSProperties, type ReactNode } from "react";

export function StatCard({
  value,
  label,
  tone,
  tip,
}: {
  value: ReactNode;
  label: string;
  tone?: "green" | "red";
  tip?: string;
}) {
  return (
    <div className={`stat-card ${tone ?? ""}`}>
      <div className="value">{value}</div>
      <div className="label" data-tip={tip}>
        {label}
      </div>
    </div>
  );
}

const ALLOWED_TAGS = new Set([
  "p", "div", "span", "h3", "strong", "em", "br", "table", "tbody", "tr", "th", "td",
]);
const ALLOWED_CLASSES = new Set(["section-title", "chart-container"]);
const ALLOWED_STYLES = [
  "color", "lineHeight", "fontSize", "marginTop", "marginBottom", "padding", "width",
] as const;

function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    // React rejects whitespace directly inside table markup.
    const inTable = /^(TABLE|TBODY|TR)$/.test(node.parentElement?.tagName ?? "");
    return inTable && !node.textContent?.trim() ? null : node.textContent;
  }
  if (!(node instanceof HTMLElement)) return null;

  const children = [...node.childNodes].map(toReact);
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return children;

  const style: CSSProperties = {};
  for (const property of ALLOWED_STYLES) {
    if (node.style[property]) style[property] = node.style[property];
  }
  const className = [...node.classList].filter((name) => ALLOWED_CLASSES.has(name)).join(" ");
  return createElement(
    tag,
    { key, style, className: className || undefined },
    ...(children.length > 0 ? children : []),
  );
}

/**
 * Shows formatted text saved on a team or player. Rebuilt from a short list of
 * tags and styles, so saved text can only format and can never run code.
 */
export function RichText({ html }: { html: string }) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return <>{[...parsed.body.childNodes].map(toReact)}</>;
}
