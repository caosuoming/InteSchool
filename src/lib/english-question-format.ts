/** Emphasize question indices and distinguish inline A-H option labels without changing stored text. */
export function emphasizeEnglishQuestionHtml(html: string): string {
  if (!html) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  const pattern = /(^|\s)([（(]\d{1,3}[）)]|\d{1,3}[.．、)）]|[A-H][.．、)）])(?=\s|$|[\u4e00-\u9fff])/gm;
  const colors = ["text-blue-700 bg-blue-50", "text-emerald-700 bg-emerald-50", "text-amber-700 bg-amber-50", "text-violet-700 bg-violet-50", "text-rose-700 bg-rose-50", "text-cyan-700 bg-cyan-50", "text-red-700 bg-red-50", "text-teal-700 bg-teal-50"];
  for (const textNode of nodes) {
    if (textNode.parentElement?.closest(".katex, .formula-inline, code, pre, script, style, .english-question-marker")) continue;
    const content = textNode.data;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of content.matchAll(pattern)) {
      const start = match.index + match[1].length;
      const marker = match[2];
      fragment.append(document.createTextNode(content.slice(cursor, start)));
      const span = document.createElement("strong");
      span.className = `english-question-marker rounded-sm px-0.5 font-bold ${/^\d/.test(marker) ? "text-indigo-700 bg-indigo-50" : colors[marker.charCodeAt(0) - 65]}`;
      span.textContent = marker;
      fragment.append(span);
      cursor = start + marker.length;
    }
    if (cursor === 0) continue;
    fragment.append(document.createTextNode(content.slice(cursor)));
    textNode.replaceWith(fragment);
  }
  return template.innerHTML;
}
