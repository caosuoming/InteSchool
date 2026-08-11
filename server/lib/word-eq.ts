const FULL_WIDTH_MATH: Record<string, string> = {
  "＋": "+",
  "－": "-",
  "＝": "=",
  "（": "(",
  "）": ")",
  "，": ",",
  "×": "\\times ",
  "·": "\\cdot ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "∞": "\\infty ",
  "λ": "\\lambda ",
  "…": "\\cdots ",
};

function splitArguments(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function delimiterLatex(value: string, side: "left" | "right"): string {
  if (!value) return ".";
  if (value === "{") return "\\{";
  if (value === "}") return "\\}";
  if (["(", ")", "[", "]", "|"].includes(value)) return value;
  return side === "left" ? "(" : ")";
}

class EqParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): string {
    return this.parseSequence();
  }

  private peek(): string {
    return this.source[this.index] || "";
  }

  private consumeWhitespace(): void {
    while (/\s/.test(this.peek())) this.index += 1;
  }

  private readCommand(): string {
    if (this.peek() !== "\\") return "";
    this.index += 1;
    const start = this.index;
    while (/[A-Za-z]/.test(this.peek())) this.index += 1;
    return this.source.slice(start, this.index).toLowerCase();
  }

  private readNumber(): string {
    const start = this.index;
    while (/[0-9.+-]/.test(this.peek())) this.index += 1;
    return this.source.slice(start, this.index);
  }

  private readEscapedDelimiter(): string {
    if (this.peek() === "\\") this.index += 1;
    const delimiter = this.peek();
    if (delimiter) this.index += 1;
    return delimiter;
  }

  private readRawGroup(): string | null {
    this.consumeWhitespace();
    if (this.peek() !== "(") return null;
    this.index += 1;
    const start = this.index;
    let depth = 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          const value = this.source.slice(start, this.index);
          this.index += 1;
          return value;
        }
      }
      this.index += 1;
    }
    return this.source.slice(start);
  }

  private parseFragment(value: string): string {
    return new EqParser(value).parse();
  }

  private parseFraction(): string {
    const raw = this.readRawGroup();
    if (raw === null) return "";
    const [numerator = "", denominator = ""] = splitArguments(raw);
    return `\\frac{${this.parseFragment(numerator)}}{${this.parseFragment(denominator)}}`;
  }

  private parseRoot(): string {
    const raw = this.readRawGroup();
    if (raw === null) return "";
    const args = splitArguments(raw);
    if (args.length >= 2) {
      return `\\sqrt[${this.parseFragment(args[0])}]{${this.parseFragment(args.slice(1).join(","))}}`;
    }
    return `\\sqrt{${this.parseFragment(args[0] || "")}}`;
  }

  private parseScript(): string {
    this.consumeWhitespace();
    const command = this.readCommand();
    this.readNumber();
    const raw = this.readRawGroup();
    if (raw === null) return "";
    const body = this.parseFragment(raw);
    if (command === "do") return `{}_{${body}}`;
    return `{}^{${body}}`;
  }

  private parseArray(): string {
    this.consumeWhitespace();
    while (this.peek() === "\\") {
      const checkpoint = this.index;
      const command = this.readCommand();
      if (!["al", "ac", "ar", "vs", "hs", "co"].includes(command)) {
        this.index = checkpoint;
        break;
      }
      this.readNumber();
      this.consumeWhitespace();
    }
    const raw = this.readRawGroup();
    if (raw === null) return "";
    const rows = splitArguments(raw).map((part) => this.parseFragment(part));
    return `\\begin{matrix}${rows.join("\\\\")}\\end{matrix}`;
  }

  private parseBrackets(): string {
    let left = "";
    let right = "";
    this.consumeWhitespace();
    while (this.peek() === "\\") {
      const checkpoint = this.index;
      const command = this.readCommand();
      if (command === "lc") left = this.readEscapedDelimiter();
      else if (command === "rc") right = this.readEscapedDelimiter();
      else {
        this.index = checkpoint;
        break;
      }
      this.consumeWhitespace();
    }
    const raw = this.readRawGroup();
    if (raw === null) return "";
    return `\\left${delimiterLatex(left, "left")}${this.parseFragment(raw)}\\right${delimiterLatex(right, "right")}`;
  }

  private parseOverstrike(): string {
    this.consumeWhitespace();
    while (this.peek() === "\\") {
      const checkpoint = this.index;
      const command = this.readCommand();
      if (!["al", "ac", "ar"].includes(command)) {
        this.index = checkpoint;
        break;
      }
      this.consumeWhitespace();
    }
    const raw = this.readRawGroup();
    if (raw === null) return "";
    const args = splitArguments(raw).map((part) => this.parseFragment(part));
    if (args.length === 2) return `{}_{${args[1]}}^{${args[0]}}`;
    return args.join("");
  }

  private parseUnknownCommand(): string {
    this.readNumber();
    const raw = this.readRawGroup();
    return raw === null ? "" : this.parseFragment(raw);
  }

  private parseSequence(): string {
    let output = "";
    while (this.index < this.source.length) {
      const char = this.peek();
      if (char === "\\") {
        const command = this.readCommand();
        if (!command) {
          const escaped = this.peek();
          if (escaped) {
            output += FULL_WIDTH_MATH[escaped] || escaped;
            this.index += 1;
          }
          continue;
        }
        if (command === "f") output += this.parseFraction();
        else if (command === "r") output += this.parseRoot();
        else if (command === "s") output += this.parseScript();
        else if (command === "a") output += this.parseArray();
        else if (command === "b") output += this.parseBrackets();
        else if (command === "o") output += this.parseOverstrike();
        else output += this.parseUnknownCommand();
        continue;
      }
      output += FULL_WIDTH_MATH[char] || char;
      this.index += 1;
    }
    return output.trim();
  }
}

/** Converts legacy Word `EQ` field instructions to KaTeX-compatible LaTeX. */
export function wordEqFieldToLatex(instruction: string): string | null {
  const match = instruction.trim().match(/^eq\b([\s\S]*)$/i);
  if (!match) return null;
  const source = match[1].trim();
  if (!source) return null;
  const latex = new EqParser(source).parse().trim();
  return latex || null;
}
