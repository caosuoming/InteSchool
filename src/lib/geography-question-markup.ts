import { splitGeographyChoiceGroup } from "./geography-paper-layout";
import { getQuestionOptionGridColumns } from "./question-option-layout";

const optionStyles = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-orange-100 text-orange-800",
  "bg-purple-100 text-purple-800",
];

export function geographyOptionLabelClass(index: number): string {
  return optionStyles[index % optionStyles.length];
}

const markerPattern = /(^|\n)([ \t]*)(\d{1,3}\s*[.．、:：)）]|[（(]\s*\d{1,3}\s*[）)])|(^|[ \t\u3000])([A-Da-d]\s*[.．、:：)）])(?=[ \t]*\S)/gm;

/** Emphasize numbered questions and their option labels without modifying stored text or rich markup. */
export function emphasizeGeographyLabels(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest(".katex, .formula-inline, code, pre, table, .geography-label")) {
      nodes.push(node);
    }
  }
  for (const node of nodes) {
    const original = node.textContent || "";
    markerPattern.lastIndex = 0;
    const matches = [...original.matchAll(markerPattern)];
    if (!matches.length) continue;
    const replacement = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      const index = match.index || 0;
      const leading = match[1] !== undefined ? match[1] + match[2] : match[4];
      const label = match[3] || match[5];
      replacement.appendChild(document.createTextNode(original.slice(cursor, index) + leading));
      const span = document.createElement("span");
      const optionIndex = label?.toUpperCase().charCodeAt(0) - 65;
      span.className = `geography-label inline-block rounded px-1 font-mono font-bold ${match[3]
        ? "bg-indigo-100 text-indigo-800"
        : geographyOptionLabelClass(optionIndex)}`;
      span.textContent = label;
      replacement.appendChild(span);
      cursor = index + match[0].length;
    }
    replacement.appendChild(document.createTextNode(original.slice(cursor)));
    node.replaceWith(replacement);
  }
  return container.innerHTML;
}

/** Lay out consecutive A–D lines in grouped geography stems as evenly spaced choices. */
export function renderGeographyChoiceGroups(
  source: string,
  render: (part: string) => string,
  formatGroup = false,
): string {
  const group = formatGroup ? splitGeographyChoiceGroup(source) : null;
  if (group) {
    return [
      ...(group.introduction
        ? [`<div class="geography-reading mb-2" style="font-family: KaiTi, STKaiti, 'Kaiti SC', serif">${render(group.introduction)}</div>`]
        : []),
      ...group.questions.map((question) =>
        `<div class="geography-subquestion my-2">${renderGeographyChoiceGroups(question, render)}</div>`),
    ].join("");
  }
  const lines = source.split("\n");
  const optionLine = /^\s*([A-Da-d])\s*[.．、:：)）]\s*(\S.*)$/;
  const result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const first = optionLine.exec(lines[index]);
    if (first?.[1].toUpperCase() === "A") {
      const options = [first[2]];
      let next = index + 1;
      while (next < lines.length) {
        const entry = optionLine.exec(lines[next]);
        if (!entry || entry[1].toUpperCase().charCodeAt(0) !== 65 + options.length) break;
        options.push(entry[2]);
        next += 1;
      }
      if (options.length >= 2) {
        result.push(`<div class="geography-option-grid my-2 grid gap-x-4 gap-y-2 ${getQuestionOptionGridColumns(options)}">${options
          .map((option, optionIndex) => `<div class="flex min-w-0 items-start gap-1.5"><span class="geography-label inline-block shrink-0 rounded px-1 font-mono font-bold ${geographyOptionLabelClass(optionIndex)}">${String.fromCharCode(65 + optionIndex)}.</span><div class="min-w-0 flex-1">${render(option)}</div></div>`)
          .join("")}</div>`);
        index = next;
        continue;
      }
    }
    const plain: string[] = [];
    while (index < lines.length) {
      const candidate = optionLine.exec(lines[index]);
      if (candidate?.[1].toUpperCase() === "A") {
        const next = optionLine.exec(lines[index + 1] || "");
        if (next?.[1].toUpperCase() === "B") break;
      }
      plain.push(lines[index]);
      index += 1;
    }
    if (plain.length) result.push(render(plain.join("\n")));
  }
  return result.join("\n");
}
