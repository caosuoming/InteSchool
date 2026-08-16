/**
 * OMML (Office Math Markup Language) 到 LaTeX 的转换器
 *
 * 用于解析 docx 文档中的数学公式（包括 MathType 和 Word 原生公式），
 * 将其转换为 LaTeX 字符串，再由 KaTeX 渲染显示。
 *
 * 支持的 OMML 元素：
 * - m:r/m:t 文本
 * - m:frac 分式
 * - m:rad 根号
 * - m:sup 上标
 * - m:sub 下标
 * - m:subSup 上下标
 * - m:nary n元运算（求和、积分等）
 * - m:d 定界符（括号）
 * - m:func 函数
 * - m:eqArr 方程组
 * - m:m 矩阵
 * - m:acc 重音符号
 * - m:bar 上划线
 * - m:limLow/limUpp 极限
 */

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * 将 OMML 元素或 XML 字符串（m:oMath 或 m:oMathPara）转换为 LaTeX 字符串
 * 支持传入 DOM Element 对象或 OMML XML 字符串
 */
export function ommlToLatex(mathEl: Element | string): string {
  let element: Element;
  
  if (typeof mathEl === "string") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(mathEl, "application/xml");
    const oMath = doc.getElementsByTagNameNS(MATH_NS, "oMath")[0];
    const oMathPara = doc.getElementsByTagNameNS(MATH_NS, "oMathPara")[0];
    element = oMath || oMathPara || doc.documentElement;
  } else {
    element = mathEl;
  }
  
  const latex = stretchMatrixDelimiters(convertNode(element).trim());
  return latex || "";
}

function stretchMatrixDelimiters(latex: string): string {
  return latex
    .replace(
      /\|\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\|/g,
      String.raw`\left|\begin{matrix}$1\end{matrix}\right|`,
    )
    .replace(
      /\(\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\)/g,
      String.raw`\left(\begin{matrix}$1\end{matrix}\right)`,
    )
    .replace(
      /\[\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\]/g,
      String.raw`\left[\begin{matrix}$1\end{matrix}\right]`,
    );
}

/**
 * 递归转换 OMML 节点
 */
function convertNode(node: Node): string {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent || "";
    return text.trim() ? text : "";
  }

  if (node.nodeType !== ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.localName;

  // 忽略属性元素，只处理内容
  if (isPropertyElement(tag)) {
    return "";
  }

  switch (tag) {
    case "oMath":
    case "oMathPara":
      return convertChildren(el);

    case "r":
      // 数学运行，处理其文本内容
      return convertRun(el);

    case "t":
      // 文本节点
      return escapeLatex(el.textContent || "");

    case "frac":
    case "f":
      return convertFrac(el);

    case "rad":
      return convertRad(el);

    case "sup":
      return convertSup(el);

    case "sub":
      return convertSub(el);

    case "subSup":
      return convertSubSup(el);

    case "nary":
      return convertNary(el);

    case "d":
      return convertDelimiter(el);

    case "func":
      return convertFunc(el);

    case "eqArr":
      return convertEqArr(el);

    case "m":
      return convertMatrix(el);

    case "acc":
      return convertAcc(el);

    case "bar":
      return convertBar(el);

    case "limLow":
      return convertLimLow(el);

    case "limUpp":
      return convertLimUpp(el);

    case "groupChr":
      return convertGroupChr(el);

    case "borderBox":
      return convertBorderBox(el);

    case "box":
      return convertChildren(el);
    
    case "sSubSup":
      return convertSubSup(el);
    
    case "sSup":
      return convertSup(el);
    
    case "sSub":
      return convertSub(el);

    case "e":
    case "num":
    case "den":
    case "lim":
    case "sup_node":
    case "sub_node":
    case "fName":
    case "chr":
    case "deg":
      return convertChildren(el);

    case "phant":
      return "";

    case "sym":
      return convertSym(el);

    case "mo":
      return convertMo(el);

    case "ne":
      return "\\neq ";

    case "text":
      return convertText(el);

    default:
      return convertChildren(el);
  }
}

function isPropertyElement(tag: string): boolean {
  return [
    "rPr", "ctrlPr", "oMathParaPr", "mPr", "fPr",
    "radPr", "supPr", "subPr", "naryPr", "dPr",
    "funcPr", "eqArrPr", "mPr", "accPr", "barPr",
    "limLowPr", "limUppPr", "groupChrPr", "borderBoxPr",
    "sSubSupPr", "sSupPr", "sSubPr",
  ].includes(tag);
}

function convertChildren(el: Element): string {
  let result = "";
  for (const child of Array.from(el.childNodes)) {
    result += convertNode(child);
  }
  return result;
}

function convertRun(el: Element): string {
  let result = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      const childEl = child as Element;
      if (childEl.localName === "t") {
        result += escapeLatex(childEl.textContent || "");
      } else if (!isPropertyElement(childEl.localName)) {
        result += convertNode(child);
      }
    }
  }
  return result;
}

/**
 * 分式 m:frac
 * <m:frac><m:num>...</m:num><m:den>...</m:den></m:frac>
 */
function convertFrac(el: Element): string {
  const numEl = el.getElementsByTagNameNS(MATH_NS, "num")[0];
  const denEl = el.getElementsByTagNameNS(MATH_NS, "den")[0];

  const num = numEl ? convertChildren(numEl) : "";
  const den = denEl ? convertChildren(denEl) : "";

  return `\\frac{${num}}{${den}}`;
}

/**
 * 根号 m:rad
 * <m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg>...</m:deg><m:e>...</m:e></m:rad>
 */
function convertRad(el: Element): string {
  const deg = getMathChild(el, "deg");
  const e = getMathChild(el, "e");

  // 检查是否隐藏次数
  const radPr = el.getElementsByTagNameNS(MATH_NS, "radPr")[0];
  const degHide = radPr?.getElementsByTagNameNS(MATH_NS, "degHide")[0];
  const hideDeg = degHide?.getAttribute("m:val") === "1" || degHide?.getAttribute("val") === "1";

  if (hideDeg || !deg) {
    return `\\sqrt{${e}}`;
  }
  return `\\sqrt[${deg}]{${e}}`;
}

/**
 * 上标 m:sup
 * <m:sup><m:e>...</m:e><m:sup>...</m:sup></m:sup>
 */
function convertSup(el: Element): string {
  const eEl = el.getElementsByTagNameNS(MATH_NS, "e")[0];
  const supEl = el.getElementsByTagNameNS(MATH_NS, "sup")[0];

  const e = eEl ? convertChildren(eEl) : "";
  const sup = supEl ? supEl.textContent || "" : "";

  if (!sup || sup.trim() === "") {
    return e;
  }

  return `{${e}}^{${sup}}`;
}

/**
 * 下标 m:sub
 * <m:sub><m:e>...</m:e><m:sub>...</m:sub></m:sub>
 */
function convertSub(el: Element): string {
  const e = getMathChild(el, "e");
  const sub = getMathChild(el, "sub");
  if (!sub || sub.trim() === "") {
    return e;
  }
  return `{${e}}_{${sub}}`;
}

/**
 * 上下标 m:subSup
 * <m:subSup><m:e>...</m:e><m:sub>...</m:sub><m:sup>...</m:sup></m:subSup>
 */
function convertSubSup(el: Element): string {
  const e = getMathChild(el, "e");
  const sub = getMathChild(el, "sub");
  const sup = getMathChild(el, "sup");
  let result = e;
  if (sub && sub.trim() !== "") {
    result += `_{${sub}}`;
  }
  if (sup && sup.trim() !== "") {
    result += `^{${sup}}`;
  }
  return result;
}

/**
 * n元运算 m:nary
 * 求和、积分、乘积等
 */
function convertNary(el: Element): string {
  const naryPr = el.getElementsByTagNameNS(MATH_NS, "naryPr")[0];
  const chrEl = naryPr?.getElementsByTagNameNS(MATH_NS, "chr")[0];
  const chr = chrEl?.getAttribute("m:val") || chrEl?.getAttribute("val") || "∑";

  const operator = mapNaryOperator(chr);

  const sub = getMathChild(el, "sub");
  const sup = getMathChild(el, "sup");
  const e = getMathChild(el, "e");

  let result = shouldStackNaryLimits(chr) ? `${operator}\\limits` : operator;
  if (sub) result += `_{${sub}}`;
  if (sup) result += `^{${sup}}`;
  result += ` ${e}`;

  return result;
}

function shouldStackNaryLimits(chr: string): boolean {
  return ["∑", "∏", "∐", "⋃", "⋂", "⨁", "⨂"].includes(chr);
}

function mapNaryOperator(chr: string): string {
  const map: Record<string, string> = {
    "∑": "\\sum",
    "∫": "\\int",
    "∮": "\\oint",
    "∏": "\\prod",
    "∐": "\\coprod",
    "⋃": "\\bigcup",
    "⋂": "\\bigcap",
    "⨁": "\\bigoplus",
    "⨂": "\\bigotimes",
    "⊕": "\\oplus",
    "⊗": "\\otimes",
  };
  return map[chr] || chr;
}

/**
 * 定界符 m:d
 * 括号、绝对值等
 */
function convertDelimiter(el: Element): string {
  const dPr = el.getElementsByTagNameNS(MATH_NS, "dPr")[0];

  let beginChr = "(";
  let endChr = ")";

  if (dPr) {
    const begChrEl = dPr.getElementsByTagNameNS(MATH_NS, "begChr")[0];
    const endChrEl = dPr.getElementsByTagNameNS(MATH_NS, "endChr")[0];
    beginChr = delimiterCharacter(begChrEl, "(");
    endChr = delimiterCharacter(endChrEl, ")");
  }

  const e = getMathChild(el, "e");

  const leftDelim = mapDelimiter(beginChr);
  const rightDelim = mapDelimiter(endChr);

  return `\\left${leftDelim}${e}\\right${rightDelim}`;
}

function delimiterCharacter(element: Element | undefined, fallback: string): string {
  if (!element) return fallback;
  const namespaced = element.getAttribute("m:val");
  if (namespaced !== null) return namespaced;
  const unqualified = element.getAttribute("val");
  return unqualified ?? fallback;
}

function mapDelimiter(chr: string): string {
  const map: Record<string, string> = {
    "(": "(",
    ")": ")",
    "[": "[",
    "]": "]",
    "{": "\\{",
    "}": "\\}",
    "|": "|",
    "‖": "\\|",
    "⌈": "\\lceil",
    "⌉": "\\rceil",
    "⌊": "\\lfloor",
    "⌋": "\\rfloor",
    "⟨": "\\langle",
    "⟩": "\\rangle",
    "": ".",
  };
  return map[chr] || chr;
}

/**
 * 函数 m:func
 * 如 lim, sin, cos, log 等
 */
function convertFunc(el: Element): string {
  const fName = getMathChild(el, "fName");
  const e = getMathChild(el, "e");

  // 检查是否是极限等特殊函数
  const funcName = fName.trim();

  if (/lim/i.test(funcName)) {
    // 极限特殊处理
    const limLow = el.getElementsByTagNameNS(MATH_NS, "limLow")[0];
    if (limLow) {
      return convertLimLow(limLow);
    }
    return `\\lim ${e}`;
  }

  const latexFunc = mapFunction(funcName);
  if (latexFunc) {
    // 函数名 + 参数，确保参数有括号包裹
    if (e && e !== "{}") {
      return `${latexFunc} ${e}`;
    }
    return `${latexFunc} {${e}}`;
  }

  // 未识别的函数名：使用 \operatorname 确保正体渲染
  if (funcName) {
    return `\\operatorname{${funcName}} ${e}`;
  }

  return e;
}

function mapFunction(name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  const map: Record<string, string> = {
    "sin": "\\sin",
    "cos": "\\cos",
    "tan": "\\tan",
    "cot": "\\cot",
    "sec": "\\sec",
    "csc": "\\csc",
    "arcsin": "\\arcsin",
    "arccos": "\\arccos",
    "arctan": "\\arctan",
    "sinh": "\\sinh",
    "cosh": "\\cosh",
    "tanh": "\\tanh",
    "log": "\\log",
    "ln": "\\ln",
    "lg": "\\lg",
    "exp": "\\exp",
    "min": "\\min",
    "max": "\\max",
    "inf": "\\inf",
    "sup": "\\sup",
    "lim": "\\lim",
    "det": "\\det",
    "dim": "\\dim",
    "gcd": "\\gcd",
    "hom": "\\hom",
    "ker": "\\ker",
    "arg": "\\arg",
    "deg": "\\deg",
    "pr": "\\Pr",
    "mod": "\\bmod",
    "sgn": "\\operatorname{sgn}",
    "argmax": "\\operatorname{argmax}",
    "argmin": "\\operatorname{argmin}",
    "diag": "\\operatorname{diag}",
    "rank": "\\operatorname{rank}",
    "trace": "\\operatorname{tr}",
    "tr": "\\operatorname{tr}",
    "adj": "\\operatorname{adj}",
    "erf": "\\operatorname{erf}",
    "erfc": "\\operatorname{erfc}",
    "sinc": "\\operatorname{sinc}",
    "sign": "\\operatorname{sign}",
    "card": "\\operatorname{card}",
    "dom": "\\operatorname{dom}",
    "ran": "\\operatorname{ran}",
    "im": "\\operatorname{Im}",
    "re": "\\operatorname{Re}",
    "var": "\\operatorname{Var}",
    "cov": "\\operatorname{Cov}",
    "corr": "\\operatorname{Corr}",
  };
  return map[trimmed] || null;
}

/**
 * 方程组 m:eqArr
 * 支持普通方程组和分段函数
 */
function convertEqArr(el: Element): string {
  const rows: string[] = [];
  const rowEls = directMathChildren(el, "e");

  for (let i = 0; i < rowEls.length; i++) {
    const rowContent = convertChildren(rowEls[i]);
    rows.push(rowContent);
  }
  
  // 检查是否是分段函数（通常有多个行）
  if (rows.length >= 2) {
    // 尝试使用 cases 环境（分段函数）
    // 每行应该包含表达式和条件，用 & 分隔
    const casesRows = rows.map((row) => {
      // 尝试分离表达式和条件
      // 条件可能以 "if"、"when" 或逗号开头
      const parts = row.split(/\s*(?:if|when|,\s*)\s*/i);
      if (parts.length === 2) {
        return `${parts[0]} & ${parts[1]}`;
      }
      // 如果没有明确的条件分隔符，返回整行
      return row;
    });
    
    return `\\begin{cases}\n${casesRows.join(" \\\\\n")}\n\\end{cases}`;
  }
  
  return `\\begin{aligned} ${rows.join(" \\\\ ")} \\end{aligned}`;
}

/**
 * 矩阵 m:m
 */
function convertMatrix(el: Element): string {
  const rows: string[] = [];
  const rowEls = directMathChildren(el, "mr");

  for (let i = 0; i < rowEls.length; i++) {
    const cells: string[] = [];
    const cellEls = directMathChildren(rowEls[i], "e");
    for (let j = 0; j < cellEls.length; j++) {
      cells.push(convertChildren(cellEls[j]));
    }
    rows.push(cells.join(" & "));
  }

  // OMML stores visible delimiters in a surrounding m:d element. m:mcs only
  // describes matrix columns and must not introduce parentheses by itself.
  return `\\begin{matrix} ${rows.join(" \\\\ ")} \\end{matrix}`;
}

function directMathChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.childNodes).filter((node): node is Element =>
    node.nodeType === ELEMENT_NODE
    && (node as Element).namespaceURI === MATH_NS
    && (node as Element).localName === localName
  );
}

/**
 * 重音符号 m:acc
 * 如向量、帽子等
 */
function convertAcc(el: Element): string {
  const accPr = el.getElementsByTagNameNS(MATH_NS, "accPr")[0];
  const chrEl = accPr?.getElementsByTagNameNS(MATH_NS, "chr")[0];
  const chr = chrEl?.getAttribute("m:val") || chrEl?.getAttribute("val") || "⃗";

  const e = getMathChild(el, "e");
  const accent = mapAccent(chr);

  return `${accent}{${e}}`;
}

function mapAccent(chr: string): string {
  const map: Record<string, string> = {
    "⃗": "\\vec",
    "⃖": "\\vec",
    "^": "\\hat",
    "̂": "\\hat",
    "̃": "\\tilde",
    "̄": "\\bar",
    "̇": "\\dot",
    "̈": "\\ddot",
    "̌": "\\check",
    "̆": "\\breve",
    "⏞": "\\overbrace",
    "⏟": "\\underbrace",
  };
  return map[chr] || "\\vec";
}

/**
 * 上划线/下划线 m:bar
 */
function convertBar(el: Element): string {
  const barPr = el.getElementsByTagNameNS(MATH_NS, "barPr")[0];
  const posEl = barPr?.getElementsByTagNameNS(MATH_NS, "pos")[0];
  const pos = posEl?.getAttribute("m:val") || posEl?.getAttribute("val") || "top";

  const e = getMathChild(el, "e");

  if (pos === "bot") {
    return `\\underline{${e}}`;
  }
  return `\\overline{${e}}`;
}

/**
 * 下极限 m:limLow
 */
function convertLimLow(el: Element): string {
  const e = getMathChild(el, "e");
  const lim = getMathChild(el, "lim");

  return `{${e}}_{${lim}}`;
}

/**
 * 上极限 m:limUpp
 */
function convertLimUpp(el: Element): string {
  const e = getMathChild(el, "e");
  const lim = getMathChild(el, "lim");

  return `{${e}}^{${lim}}`;
}

/**
 * 底部字符 m:groupChr
 * 如下方大括号
 */
function convertGroupChr(el: Element): string {
  const groupChrPr = el.getElementsByTagNameNS(MATH_NS, "groupChrPr")[0];
  const chrEl = groupChrPr?.getElementsByTagNameNS(MATH_NS, "chr")[0];
  const chr = chrEl?.getAttribute("m:val") || chrEl?.getAttribute("val") || "⏟";

  const e = getMathChild(el, "e");

  if (chr === "⏟" || chr === "_") {
    return `\\underbrace{${e}}`;
  } else if (chr === "⏞" || chr === "^") {
    return `\\overbrace{${e}}`;
  }

  return e;
}

/**
 * 边框 m:borderBox
 */
function convertBorderBox(el: Element): string {
  const e = getMathChild(el, "e");
  return `\\boxed{${e}}`;
}

/**
 * 获取指定标签的数学子元素的 LaTeX 内容
 */
function getMathChild(parent: Element, tagName: string): string {
  const child = parent.getElementsByTagNameNS(MATH_NS, tagName)[0];
  if (!child) return "";
  return convertChildren(child);
}

/**
 * 符号 m:sym - MathType 特有符号元素
 */
function convertSym(el: Element): string {
  const val = el.getAttribute("m:val") || el.getAttribute("val") || "";
  const symMap: Record<string, string> = {
    "|": "\\vert ",
    "||": "\\Vert ",
    "\\": "\\backslash ",
    "/": "/",
    "=": "=",
    "+": "+",
    "-": "-",
    "*": "\\cdot ",
    "<": "<",
    ">": ">",
    ":": ":",
    ";": ";",
    ",": ",",
    ".": ".",
    "!": "!",
    "?": "?",
    "(": "\\left(",
    ")": "\\right)",
    "[": "\\left[",
    "]": "\\right]",
    "{": "\\{",
    "}": "\\}",
    "angle": "\\angle ",
    "parallel": "\\parallel ",
    "perp": "\\perp ",
    "deg": "^\\circ",
    "prime": "'",
    "doubleprime": "''",
    "tripleprime": "'''",
    "backprime": "\\backprime ",
    "infty": "\\infty ",
    "pi": "\\pi ",
    "euler": "e",
    "phi": "\\phi ",
    "theta": "\\theta ",
    "lambda": "\\lambda ",
    "mu": "\\mu ",
    "nu": "\\nu ",
    "xi": "\\xi ",
    "rho": "\\rho ",
    "sigma": "\\sigma ",
    "tau": "\\tau ",
    "upsilon": "\\upsilon ",
    "chi": "\\chi ",
    "psi": "\\psi ",
    "omega": "\\omega ",
    "alpha": "\\alpha ",
    "beta": "\\beta ",
    "gamma": "\\gamma ",
    "delta": "\\delta ",
    "epsilon": "\\epsilon ",
    "zeta": "\\zeta ",
    "eta": "\\eta ",
    "iota": "\\iota ",
    "kappa": "\\kappa ",
    "Gamma": "\\Gamma ",
    "Delta": "\\Delta ",
    "Theta": "\\Theta ",
    "Lambda": "\\Lambda ",
    "Xi": "\\Xi ",
    "Pi": "\\Pi ",
    "Sigma": "\\Sigma ",
    "Upsilon": "\\Upsilon ",
    "Phi": "\\Phi ",
    "Psi": "\\Psi ",
    "Omega": "\\Omega ",
    "aleph": "\\aleph ",
    "hbar": "\\hbar ",
    "ell": "\\ell ",
    "wp": "\\wp ",
    "Re": "\\Re ",
    "Im": "\\Im ",
    "partial": "\\partial ",
    "nabla": "\\nabla ",
    "surd": "\\sqrt ",
    "mid": "\\mid ",
    "amalg": "\\amalg ",
    "cap": "\\cap ",
    "cup": "\\cup ",
    "uplus": "\\uplus ",
    "sqcap": "\\sqcap ",
    "sqcup": "\\sqcup ",
    "triangle": "\\triangle ",
    "triangledown": "\\triangledown ",
    "lhd": "\\lhd ",
    "rhd": "\\rhd ",
    "unlhd": "\\unlhd ",
    "unrhd": "\\unrhd ",
    "subset": "\\subset ",
    "supset": "\\supset ",
    "subseteq": "\\subseteq ",
    "supseteq": "\\supseteq ",
    "sqsubset": "\\sqsubset ",
    "sqsupset": "\\sqsupset ",
    "in": "\\in ",
    "ni": "\\ni ",
    "notin": "\\notin ",
    "propto": "\\propto ",
    "models": "\\models ",
    "vdash": "\\vdash ",
    "dashv": "\\dashv ",
    "bowtie": "\\bowtie ",
    "smile": "\\smile ",
    "frown": "\\frown ",
    "asymp": "\\asymp ",
    "approx": "\\approx ",
    "cong": "\\cong ",
    "equiv": "\\equiv ",
    "neq": "\\neq ",
    "leq": "\\leq ",
    "geq": "\\geq ",
    "prec": "\\prec ",
    "succ": "\\succ ",
    "preceq": "\\preceq ",
    "succeq": "\\succeq ",
    "ll": "\\ll ",
    "gg": "\\gg ",
    "doteq": "\\doteq ",
    "doteqdot": "\\doteqdot ",
    "overset": "\\overset ",
    "underset": "\\underset ",
    "stackrel": "\\stackrel ",
    "mapsto": "\\mapsto ",
    "to": "\\to ",
    "rightarrow": "\\rightarrow ",
    "leftarrow": "\\leftarrow ",
    "leftrightarrow": "\\leftrightarrow ",
    "Rightarrow": "\\Rightarrow ",
    "Leftarrow": "\\Leftarrow ",
    "Leftrightarrow": "\\Leftrightarrow ",
    "longmapsto": "\\longmapsto ",
    "longrightarrow": "\\longrightarrow ",
    "longleftarrow": "\\longleftarrow ",
    "longleftrightarrow": "\\longleftrightarrow ",
    "Longrightarrow": "\\Longrightarrow ",
    "Longleftarrow": "\\Longleftarrow ",
    "Longleftrightarrow": "\\Longleftrightarrow ",
    "uparrow": "\\uparrow ",
    "downarrow": "\\downarrow ",
    "updownarrow": "\\updownarrow ",
    "Uparrow": "\\Uparrow ",
    "Downarrow": "\\Downarrow ",
    "Updownarrow": "\\Updownarrow ",
    // 补充缺失的符号映射
    "ne": "\\neq ",           // 不等号
    "neqsl": "\\neq ",        // 不等号变体
    "noteq": "\\neq ",        // 不等号变体
    "iff": "\\iff ",          // 当且仅当
    "implies": "\\implies ",  // 推导符号
    "therefore": "\\therefore ",
    "because": "\\because ",
    // 三角函数中常用的希腊字母
    "vartheta": "\\vartheta ",
    "varphi": "\\varphi ",
    "varpi": "\\varpi ",
    "varrho": "\\varrho ",
    "varsigma": "\\varsigma ",
    "nearrow": "\\nearrow ",
    "searrow": "\\searrow ",
    "swarrow": "\\swarrow ",
    "nwarrow": "\\nwarrow ",
    "forall": "\\forall ",
    "exists": "\\exists ",
    "neg": "\\neg ",
    "land": "\\land ",
    "lor": "\\lor ",
    "lnot": "\\lnot ",
    "top": "\\top ",
    "bot": "\\bot ",
    "vDash": "\\vDash ",
    "Vdash": "\\Vdash ",
    "turnstile": "\\vdash ",
    "congruent": "\\cong ",
    "similar": "\\sim ",
    "simeq": "\\simeq ",
    "triangleleft": "\\triangleleft ",
    "triangleright": "\\triangleright ",
    "vartriangleleft": "\\triangleleft ",
    "vartriangleright": "\\triangleright ",
    "subsetneq": "\\subsetneq ",
    "supsetneq": "\\supsetneq ",
    "varsubsetneq": "\\varsubsetneq ",
    "varsupsetneq": "\\varsupsetneq ",
    "sqsubseteq": "\\sqsubseteq ",
    "sqsupseteq": "\\sqsupseteq ",
    "owns": "\\owns ",
    "shortparallel": "\\shortparallel ",
    "nparallel": "\\nparallel ",
    "varangle": "\\angle ",
    "lozenge": "\\lozenge ",
    "square": "\\square ",
    "blacksquare": "\\blacksquare ",
    "blacktriangle": "\\blacktriangle ",
    "blacktriangledown": "\\blacktriangledown ",
    "blacklozenge": "\\blacklozenge ",
    "bigstar": "\\bigstar ",
    "bigcirc": "\\bigcirc ",
    "bigtriangleup": "\\bigtriangleup ",
    "bigtriangledown": "\\bigtriangledown ",
    "bigoplus": "\\bigoplus ",
    "bigotimes": "\\bigotimes ",
    "bigodot": "\\bigodot ",
    "bigsqcup": "\\bigsqcup ",
    "coprod": "\\coprod ",
    "prod": "\\prod ",
    "sum": "\\sum ",
    "bigcup": "\\bigcup ",
    "bigcap": "\\bigcap ",
    "int": "\\int ",
    "oint": "\\oint ",
    "iint": "\\iint ",
    "iiint": "\\iiint ",
    "idotsint": "\\idotsint ",
    "naturals": "\\mathbb{N}",
    "integers": "\\mathbb{Z}",
    "rationals": "\\mathbb{Q}",
    "reals": "\\mathbb{R}",
    "complex": "\\mathbb{C}",
    "emptyset": "\\emptyset ",
    "aleph0": "\\aleph_0 ",
    "aleph1": "\\aleph_1 ",
    "beth": "\\beth ",
    "gimel": "\\gimel ",
    "daleth": "\\daleth ",
    "imath": "\\imath ",
    "jmath": "\\jmath ",
    "measuredangle": "\\measuredangle ",
    "sphericalangle": "\\sphericalangle ",
    "diamondsuit": "\\diamondsuit ",
    "heartsuit": "\\heartsuit ",
    "clubsuit": "\\clubsuit ",
    "spadesuit": "\\spadesuit ",
    "sharp": "\\sharp ",
    "flat": "\\flat ",
    "natural": "\\natural ",
    "copyright": "\\copyright ",
    "registered": "\\registered ",
    "trademark": "\\texttrademark ",
  };
  
  return symMap[val] || val;
}

/**
 * 运算符 m:mo - OMML 运算符元素
 * 支持直接文本内容和 m:val 属性
 */
function convertMo(el: Element): string {
  const val = el.getAttribute("m:val") || el.getAttribute("val") || "";
  
  // 如果有 val 属性，使用符号映射
  if (val) {
    return convertSymVal(val);
  }
  
  // 否则使用文本内容
  const text = el.textContent || "";
  return escapeLatex(text);
}

/**
 * 将运算符/符号的 val 值转换为 LaTeX
 */
function convertSymVal(val: string): string {
  const symMap: Record<string, string> = {
    // 基础运算符
    "=": "=",
    "+": "+",
    "-": "-",
    "*": "\\cdot ",
    "/": "/",
    "<": "<",
    ">": ">",
    ":": ":",
    ";": ";",
    ",": ",",
    ".": ".",
    "!": "!",
    "?": "?",
    "|": "\\vert ",
    "||": "\\Vert ",
    "\\": "\\backslash ",
    "(": "\\left(",
    ")": "\\right)",
    "[": "\\left[",
    "]": "\\right]",
    "{": "\\{",
    "}": "\\}",
    
    // 关系运算符
    "neq": "\\neq ",
    "ne": "\\neq ",
    "neqsl": "\\neq ",
    "noteq": "\\neq ",
    "leq": "\\leq ",
    "geq": "\\geq ",
    "prec": "\\prec ",
    "succ": "\\succ ",
    "preceq": "\\preceq ",
    "succeq": "\\succeq ",
    "ll": "\\ll ",
    "gg": "\\gg ",
    "doteq": "\\doteq ",
    "approx": "\\approx ",
    "cong": "\\cong ",
    "equiv": "\\equiv ",
    "propto": "\\propto ",
    "models": "\\models ",
    
    // 箭头
    "to": "\\to ",
    "rightarrow": "\\rightarrow ",
    "leftarrow": "\\leftarrow ",
    "leftrightarrow": "\\leftrightarrow ",
    "Rightarrow": "\\Rightarrow ",
    "Leftarrow": "\\Leftarrow ",
    "Leftrightarrow": "\\Leftrightarrow ",
    "longmapsto": "\\longmapsto ",
    "longrightarrow": "\\longrightarrow ",
    "longleftarrow": "\\longleftarrow ",
    "longleftrightarrow": "\\longleftrightarrow ",
    "Longrightarrow": "\\Longrightarrow ",
    "Longleftarrow": "\\Longleftarrow ",
    "Longleftrightarrow": "\\Longleftrightarrow ",
    "uparrow": "\\uparrow ",
    "downarrow": "\\downarrow ",
    "updownarrow": "\\updownarrow ",
    "Uparrow": "\\Uparrow ",
    "Downarrow": "\\Downarrow ",
    "Updownarrow": "\\Updownarrow ",
    "implies": "\\implies ",
    "iff": "\\iff ",
    
    // 集合符号
    "in": "\\in ",
    "ni": "\\ni ",
    "notin": "\\notin ",
    "subset": "\\subset ",
    "supset": "\\supset ",
    "subseteq": "\\subseteq ",
    "supseteq": "\\supseteq ",
    "sqsubset": "\\sqsubset ",
    "sqsupset": "\\sqsupset ",
    "sqsubseteq": "\\sqsubseteq ",
    "sqsupseteq": "\\sqsupseteq ",
    "cap": "\\cap ",
    "cup": "\\cup ",
    "uplus": "\\uplus ",
    "sqcap": "\\sqcap ",
    "sqcup": "\\sqcup ",
    "setminus": "\\setminus ",
    
    // 逻辑符号
    "forall": "\\forall ",
    "exists": "\\exists ",
    "neg": "\\neg ",
    "lnot": "\\lnot ",
    "land": "\\land ",
    "lor": "\\lor ",
    "wedge": "\\wedge ",
    "vee": "\\vee ",
    "top": "\\top ",
    "bot": "\\bot ",
    "therefore": "\\therefore ",
    "because": "\\because ",
    
    // 希腊字母
    "alpha": "\\alpha ",
    "beta": "\\beta ",
    "gamma": "\\gamma ",
    "delta": "\\delta ",
    "epsilon": "\\epsilon ",
    "zeta": "\\zeta ",
    "eta": "\\eta ",
    "theta": "\\theta ",
    "vartheta": "\\vartheta ",
    "iota": "\\iota ",
    "kappa": "\\kappa ",
    "lambda": "\\lambda ",
    "mu": "\\mu ",
    "nu": "\\nu ",
    "xi": "\\xi ",
    "pi": "\\pi ",
    "varpi": "\\varpi ",
    "rho": "\\rho ",
    "varrho": "\\varrho ",
    "sigma": "\\sigma ",
    "varsigma": "\\varsigma ",
    "tau": "\\tau ",
    "upsilon": "\\upsilon ",
    "phi": "\\phi ",
    "varphi": "\\varphi ",
    "chi": "\\chi ",
    "psi": "\\psi ",
    "omega": "\\omega ",
    "Gamma": "\\Gamma ",
    "Delta": "\\Delta ",
    "Theta": "\\Theta ",
    "Lambda": "\\Lambda ",
    "Xi": "\\Xi ",
    "Pi": "\\Pi ",
    "Sigma": "\\Sigma ",
    "Upsilon": "\\Upsilon ",
    "Phi": "\\Phi ",
    "Psi": "\\Psi ",
    "Omega": "\\Omega ",
    
    // 其他符号
    "infty": "\\infty ",
    "partial": "\\partial ",
    "nabla": "\\nabla ",
    "surd": "\\sqrt ",
    "angle": "\\angle ",
    "perp": "\\perp ",
    "parallel": "\\parallel ",
    "deg": "^\\circ",
    "prime": "'",
    "cdot": "\\cdot ",
    "times": "\\times ",
    "div": "\\div ",
  };
  
  return symMap[val] || val;
}

/**
 * 文本模式 m:text - MathType 文本模式元素
 */
function convertText(el: Element): string {
  return convertChildren(el);
}

/**
 * 转义 LaTeX 特殊字符
 */
function escapeLatex(text: string): string {
  // 数学符号映射
  const symbolMap: Record<string, string> = {
    "×": "\\times ",
    "÷": "\\div ",
    "±": "\\pm ",
    "∓": "\\mp ",
    "·": "\\cdot ",
    "≤": "\\leq ",
    "≥": "\\geq ",
    "≠": "\\neq ",
    "≈": "\\approx ",
    "≡": "\\equiv ",
    "∝": "\\propto ",
    "∞": "\\infty ",
    "→": "\\rightarrow ",
    "←": "\\leftarrow ",
    "↔": "\\leftrightarrow ",
    "⇒": "\\Rightarrow ",
    "⇐": "\\Leftarrow ",
    "⇔": "\\Leftrightarrow ",
    "∴": "\\therefore ",
    "∵": "\\because ",
    "⟹": "\\implies ",
    "⟺": "\\iff ",
    "⊢": "\\vdash ",
    "⊣": "\\dashv ",
    "↑": "\\uparrow ",
    "↓": "\\downarrow ",
    "∈": "\\in ",
    "∉": "\\notin ",
    "⊂": "\\subset ",
    "⊃": "\\supset ",
    "⊆": "\\subseteq ",
    "⊇": "\\supseteq ",
    "∪": "\\cup ",
    "∩": "\\cap ",
    "∅": "\\emptyset ",
    "∀": "\\forall ",
    "∃": "\\exists ",
    "¬": "\\neg ",
    "∧": "\\wedge ",
    "∨": "\\vee ",
    "∂": "\\partial ",
    "∇": "\\nabla ",
    "α": "\\alpha ",
    "β": "\\beta ",
    "γ": "\\gamma ",
    "δ": "\\delta ",
    "ε": "\\epsilon ",
    "ζ": "\\zeta ",
    "η": "\\eta ",
    "θ": "\\theta ",
    "ι": "\\iota ",
    "κ": "\\kappa ",
    "λ": "\\lambda ",
    "μ": "\\mu ",
    "ν": "\\nu ",
    "ξ": "\\xi ",
    "π": "\\pi ",
    "ρ": "\\rho ",
    "σ": "\\sigma ",
    "τ": "\\tau ",
    "υ": "\\upsilon ",
    "φ": "\\phi ",
    "χ": "\\chi ",
    "ψ": "\\psi ",
    "ω": "\\omega ",
    "Γ": "\\Gamma ",
    "Δ": "\\Delta ",
    "Θ": "\\Theta ",
    "Λ": "\\Lambda ",
    "Ξ": "\\Xi ",
    "Π": "\\Pi ",
    "Σ": "\\Sigma ",
    "Υ": "\\Upsilon ",
    "Φ": "\\Phi ",
    "Ψ": "\\Psi ",
    "Ω": "\\Omega ",
    // 变体希腊字母（用于三角函数等）
    "ϑ": "\\vartheta ",
    "ϕ": "\\varphi ",
    "ϱ": "\\varrho ",
    "ς": "\\varsigma ",
    // 普通拉丁字母必须保持原样。只有显式的双线体 Unicode 字符
    // （ℕ、ℤ、ℚ、ℝ、ℂ）或 convertSym 中的集合名称才转换为 \mathbb。
    "√": "\\sqrt",
    "…": "\\ldots ",
    "⋯": "\\cdots ",
    "⋮": "\\vdots ",
    "⋱": "\\ddots ",
    "°": "^{\\circ}",
    "′": "'",
    "″": "''",
    "‴": "'''",
    "ℕ": "\\mathbb{N}",
    "ℤ": "\\mathbb{Z}",
    "ℚ": "\\mathbb{Q}",
    "ℝ": "\\mathbb{R}",
    "ℂ": "\\mathbb{C}",
    "ℵ": "\\aleph ",
    "ℏ": "\\hbar ",
    "ℓ": "\\ell ",
    "ℑ": "\\Im ",
    "ℜ": "\\Re ",
    "∠": "\\angle ",
    "⊥": "\\perp ",
    "∥": "\\parallel ",
    "∘": "\\circ ",
    "⊕": "\\oplus ",
    "⊗": "\\otimes ",
    "⊙": "\\odot ",
    "⊖": "\\ominus ",
    "⊘": "\\oslash ",
    "◇": "\\diamond ",
    "□": "\\Box ",
    "△": "\\triangle ",
    // 更多箭头符号
    "↗": "\\nearrow ",
    "↘": "\\searrow ",
    "↙": "\\swarrow ",
    "↖": "\\nwarrow ",
    "↕": "\\updownarrow ",
  };

  let result = "";
  // Word and rich-text editors may encode symbols such as "≠" as a
  // decomposed sequence ("=" + U+0338). Normalize before symbol mapping so
  // the preview consistently emits the corresponding LaTeX command.
  for (const char of text.normalize("NFC")) {
    if (symbolMap[char]) {
      result += symbolMap[char];
    } else if ("#$%&~_^\\{}".includes(char)) {
      result += "\\" + char;
    } else {
      result += char;
    }
  }

  return result;
}
