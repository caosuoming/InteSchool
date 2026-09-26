const PROTECTED_CONTENT_PATTERN =
  /(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|!\[[^\]]*\]\([^)]+\)|<[^>]*>)/g;

const PLAIN_MATH_CHUNK_PATTERN =
  /[A-Za-z0-9\u0370-\u03ffℓ₀-₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾()[\]{}+\-−－*/×÷·⋅=＝<>≤≥≠≈≡⊥∥:：,.， \t]+/g;

const SUBSCRIPT_CHARACTERS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")",
  "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i", "ⱼ": "j",
  "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₒ": "o",
  "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t", "ᵤ": "u",
  "ᵥ": "v", "ₓ": "x",
};

const SUPERSCRIPT_CHARACTERS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")",
};

const RELATION_PATTERN = /[=＝<>≤≥≠≈≡⊥∥]/;
const STRONG_RELATION_PATTERN = /[=＝≤≥≠≈≡⊥∥]/;
const EXTRA_MATH_STRUCTURE_PATTERN =
  /[+\-−－*/×÷·⋅()[\]{}₀-₉₊₋₌₍₎⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾⊥∥]/;
const COORDINATE_PATTERN =
  /(?:^|[,，\s])(?:[A-Z]|[A-Z][₀-₉0-9]+)\s*[（(]\s*[A-Za-z0-9+\-−－₀-₉.]+\s*[,，]\s*[A-Za-z0-9+\-−－₀-₉.]+\s*[)）]/;

function replaceScriptCharacters(
  value: string,
  map: Record<string, string>,
  pattern: RegExp,
  marker: "_" | "^",
): string {
  return value.replace(pattern, (run) => {
    const content = Array.from(run).map((character) => map[character] || character).join("");
    return `${marker}{${content}}`;
  });
}

function normalizeLatexCandidate(value: string): string {
  let normalized = value
    .normalize("NFC")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[＝]/g, "=")
    .replace(/[－−]/g, "-");

  normalized = replaceScriptCharacters(
    normalized,
    SUBSCRIPT_CHARACTERS,
    /[₀-₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/g,
    "_",
  );
  normalized = replaceScriptCharacters(
    normalized,
    SUPERSCRIPT_CHARACTERS,
    /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾]+/g,
    "^",
  );

  return normalized
    .replace(/×/g, String.raw`\times `)
    .replace(/÷/g, String.raw`\div `)
    .replace(/[·⋅]/g, String.raw`\cdot `)
    .replace(/≤/g, String.raw`\le `)
    .replace(/≥/g, String.raw`\ge `)
    .replace(/≠/g, String.raw`\ne `)
    .replace(/≈/g, String.raw`\approx `)
    .replace(/≡/g, String.raw`\equiv `)
    .replace(/⊥/g, String.raw`\perp `)
    .replace(/∥/g, String.raw`\parallel `)
    .replace(/ℓ/g, String.raw`\ell `)
    .replace(/\b(sin|cos|tan|cot|sec|csc|log|ln|lg|lim|max|min)\b/g, String.raw`\$1`)
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyPlainMath(candidate: string): boolean {
  const compact = candidate.replace(/\s+/g, "");
  if (!compact || !/[A-Za-z\u0370-\u03ffℓ]/.test(compact)) return false;
  if (COORDINATE_PATTERN.test(candidate)) return true;
  if (!STRONG_RELATION_PATTERN.test(candidate)) return false;

  if (EXTRA_MATH_STRUCTURE_PATTERN.test(candidate)) return true;

  const sides = compact.split(RELATION_PATTERN).filter(Boolean);
  return sides.some((side) => /^(?:[a-z]{1,2}|[A-Z]|[\u0370-\u03ffℓ])(?:[₀-₉0-9])?$/.test(side));
}

function normalizePlainChunk(value: string): string {
  // An unmatched dollar usually starts a legacy/incomplete LaTeX formula.
  // Leave the whole chunk alone so the dedicated formula repair path can handle it.
  if (value.includes("$")) return value;

  return value.replace(PLAIN_MATH_CHUNK_PATTERN, (candidate) => {
    const leading = candidate.match(/^\s*/)?.[0] || "";
    const trailing = candidate.match(/\s*$/)?.[0] || "";
    let core = candidate.slice(leading.length, candidate.length - trailing.length);
    if (!core || !isLikelyPlainMath(core)) return candidate;
    if (/[=＝<>≤≥≠≈≡⊥∥+\-−－*/×÷·⋅:]$/.test(core)) return candidate;

    let suffix = "";
    while (/[.;,，]$/.test(core)) {
      suffix = core.slice(-1) + suffix;
      core = core.slice(0, -1);
    }
    if (!core || !isLikelyPlainMath(core)) return candidate;

    return `${leading}$${normalizeLatexCandidate(core)}$${suffix}${trailing}`;
  });
}

/**
 * Converts obvious plain-text mathematical expressions into InteSchool's
 * canonical dollar-delimited LaTeX representation. The heuristic is
 * intentionally conservative: it requires a mathematical relation or a
 * coordinate-like point, and leaves prose, existing formulas, images and HTML
 * untouched.
 */
export function normalizePlainMathText(value: string): string {
  if (!value) return value;

  const result: string[] = [];
  let cursor = 0;
  PROTECTED_CONTENT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROTECTED_CONTENT_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) {
      result.push(normalizePlainChunk(value.slice(cursor, match.index)));
    }
    result.push(match[0]);
    cursor = PROTECTED_CONTENT_PATTERN.lastIndex;
  }
  if (cursor < value.length) result.push(normalizePlainChunk(value.slice(cursor)));
  return result.join("");
}
