/* Parses D2 Markdown-like content and safely renders attractive HTML. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineHtml(value) {
  // Escape first so user content cannot inject HTML. Inline patterns add only fixed tags.
  let html = escapeHtml(String(value ?? ""));
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return html;
}

function highlightCode(code) {
  // Tokenize raw source first, then escape each token independently. Never run
  // syntax-highlighting regexes over generated HTML (that corrupts span tags).
  const source = String(code ?? "");
  const tokenPattern = /(#.*$|\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:import|from|return|def|class|if|elif|else|for|while|in|and|or|not|try|except|with|as|lambda|True|False|None|pass|break|continue|raise|yield|await|async|const|let|var|function|new|throw|catch|finally|public|static|void|int|float|String|boolean)\b)|(\b\d+(?:\.\d+)?\b)|\b([A-Za-z_$][A-Za-z0-9_$]*)\b(?=\s*\()/gm;
  let result = "";
  let lastIndex = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const index = match.index;
    result += escapeHtml(source.slice(lastIndex, index));
    const token = match[0];
    let className = "";
    if (match[1]) className = "tok-comment";
    else if (match[2]) className = "tok-string";
    else if (match[3]) className = "tok-keyword";
    else if (match[4]) className = "tok-number";
    else if (match[5]) className = "tok-function";
    result += className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
    lastIndex = index + token.length;
  }
  result += escapeHtml(source.slice(lastIndex));
  return result;
}

function parseD2(rawText = "") {
  const lines = String(rawText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  // Common lab-report labels are promoted to real section headings even
  // when the source description does not use Markdown # syntax.
  const sectionNames = /^(?:aim|objective|objectives|purpose|syntax|general syntax|topics?|key points?|notes?|theory|introduction|description|requirements|procedure|algorithm|explanation|program|program solution|solution|sample program|example|examples|output|sample output|expected output|result|conclusion|installation|steps involved|working principle|advantages|applications|observation|observations|summary)\s*:?[ \t]*$/i;
  const isSectionHeading = (line) => sectionNames.test(line.trim());
  const isListLine = (line) => /^(?:[-*+]\s+|\d+\s*[.)]\s*|[A-Za-z]\s*[.)]\s*)\S/i.test(line.trim());
  const isCodeLikeLine = (line) => {
    const t = line.trim();
    return /^(?:import\s+|from\s+|print\s*\(|return\s+|def\s+|class\s+|for\s+.+\s+in\s+|if\s+.+:)/.test(t) ||
      /^[A-Za-z_$][A-Za-z0-9_$.]*\s*=\s*\S/.test(t) ||
      /^[A-Za-z_$][A-Za-z0-9_$.]*\([^)]*\)\s*;?$/.test(t) ||
      /^(?:pd|np|df|series|dates|data|datetime|date_range)\.[A-Za-z_$][A-Za-z0-9_$]*\(/.test(t);
  };
  const isSpecialLine = (line) => {
    const t = line.trim();
    return /^```/.test(t) || /^#{1,6}\s+/.test(t) ||
      isSectionHeading(t) || isListLine(t) || /^\s*[-*_]{3,}\s*$/.test(t);
  };

  while (index < lines.length) {
    const current = lines[index];
    const trimmed = current.trim();

    if (!trimmed) { index += 1; continue; }

    if (/^```/.test(trimmed)) {
      const language = trimmed.replace(/^```\s*([A-Za-z0-9_+#.-]+)?.*$/, "$1") || "code";
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", label: language, text: codeLines.join("\n") });
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      blocks.push({ type: "heading", text: trimmed.replace(/^#{1,6}\s+/, "").trim() });
      index += 1;
      continue;
    }

    if (isSectionHeading(trimmed)) {
      blocks.push({ type: "heading", text: trimmed.replace(/:\s*$/, "") });
      index += 1;
      continue;
    }

    if (isCodeLikeLine(trimmed)) {
      const codeLines = [];
      while (index < lines.length && lines[index].trim() && isCodeLikeLine(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", label: "python", text: codeLines.join("\n") });
      continue;
    }

    if (isListLine(trimmed)) {
      const items = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = itemLine.match(/^([-*+]\s+|\d+\s*[.)]\s*|[A-Za-z]\s*[.)]\s*)(.+)$/);
        if (!match) break;
        let marker = match[1].trim().replace(/[.)]\s*$/, "").trim();
        if (/^[A-Za-z]$/.test(marker)) marker = marker.toLowerCase();
        items.push({ marker: marker || "•", text: match[2].trim() });
        index += 1;
      }
      if (items.length) { blocks.push({ type: "list", items }); continue; }
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || isSpecialLine(next)) break;
      paragraphLines.push(lines[index]);
      index += 1;
    }
    const paragraph = paragraphLines.join("\n").trim();
    if (paragraph) blocks.push({ type: "text", text: paragraph });
    else index += 1;
  }

  return groupProgramAndOutput(blocks);
}

/*
 * Keep a complete solution together even when the source description has
 * several mini-headings and fenced snippets. The headings become comments
 * inside one code panel; Output remains its own separate dark panel.
 */
function groupProgramAndOutput(blocks) {
  const result = [];
  const isHeading = (block, names) => block?.type === "heading" && names.test(block.text.trim());
  const outputHeading = /^(?:sample\s+)?(?:expected\s+)?output\s*:?$/i;
  const endOfProgram = /^(?:sample\s+)?(?:expected\s+)?output\s*:?$|^(?:result|conclusion)\s*:?$/i;
  const majorHeading = /^(?:aim|objective|objectives|purpose|syntax|general syntax|topics?|key points?|notes?|theory|introduction|description|requirements|procedure|algorithm|explanation|program|program solution|solution|sample program|example|examples|output|sample output|expected output|result|conclusion|installation|steps involved|working principle|advantages|applications|observation|observations|summary)\s*:?$/i;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (isHeading(block, /^(?:program solution|solution|sample program)\s*:?$/i)) {
      result.push(block);
      const codeParts = [];
      let j = i + 1;

      while (j < blocks.length && !isHeading(blocks[j], endOfProgram)) {
        const current = blocks[j];
        if (current.type === "heading") {
          // Subsection labels are retained as comments without splitting the code panel.
          codeParts.push(`# ${current.text.trim()}`);
        } else if (current.type === "code") {
          if (codeParts.length && codeParts[codeParts.length - 1] !== "") codeParts.push("");
          codeParts.push(String(current.text ?? "").replace(/\s+$/, ""));
        } else if (current.type === "text") {
          const text = String(current.text ?? "").trim();
          if (text) {
            const lines = text.split("\n");
            // Keep code-like lines as code; turn explanatory lines into comments.
            codeParts.push(...lines.map((line) => /^[\s]*(?:import\s|from\s|print\s*\(|[A-Za-z_][\w.]*\s*=|[)\]}]|[\w.]+\s*\()/.test(line) ? line : `# ${line}`));
          }
        } else if (current.type === "list") {
          current.items.forEach((item) => codeParts.push(`# ${item.marker} ${item.text}`));
        }
        j++;
      }

      const combined = codeParts.join("\n").replace(/^\n+|\n+$/g, "");
      if (combined) result.push({ type: "code", label: "python", text: combined });
      i = j - 1;
      continue;
    }

    if (isHeading(block, outputHeading)) {
      result.push(block);
      const outputParts = [];
      let j = i + 1;
      while (j < blocks.length && !(blocks[j].type === "heading" && majorHeading.test(blocks[j].text.trim()))) {
        const current = blocks[j];
        if (current.type === "code" || current.type === "text") {
          if (current.text) outputParts.push(String(current.text).trim());
        } else if (current.type === "list") {
          current.items.forEach((item) => outputParts.push(`${item.marker} ${item.text}`));
        }
        j++;
      }
      const outputText = outputParts.filter(Boolean).join("\n");
      if (outputText) result.push({ type: "code", label: "OUTPUT", text: outputText });
      i = j - 1;
      continue;
    }

    result.push(block);
  }

  return result;
}

function renderD2Content(rawText = "") {
  const root = document.createElement("div");
  root.className = "detail__d2 d2-rich";
  const blocks = parseD2(rawText);
  let firstTextBlock = true;

  blocks.forEach((block) => {
    if (block.type === "heading") {
      const heading = document.createElement("h3");
      heading.className = "d2-heading";
      heading.textContent = block.text;
      root.appendChild(heading);
      firstTextBlock = false;
      return;
    }

    if (block.type === "text") {
      const paragraph = document.createElement("p");
      paragraph.className = firstTextBlock ? "d2-lead" : "d2-paragraph";
      paragraph.innerHTML = formatInlineHtml(block.text);
      root.appendChild(paragraph);
      firstTextBlock = false;
      return;
    }

    if (block.type === "list") {
      const list = document.createElement("ul");
      list.className = "d2-list";
      block.items.forEach((item) => {
        const li = document.createElement("li");
        const marker = document.createElement("span");
        marker.className = "d2-marker";
        marker.textContent = item.marker;
        marker.setAttribute("aria-hidden", "true");
        const content = document.createElement("span");
        content.innerHTML = formatInlineHtml(item.text);
        li.append(marker, content);
        list.appendChild(li);
      });
      root.appendChild(list);
      firstTextBlock = false;
      return;
    }

    if (block.type === "divider") {
      const divider = document.createElement("hr");
      divider.className = "d2-divider";
      root.appendChild(divider);
      firstTextBlock = false;
      return;
    }

    if (block.type === "code") {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block";
      const bar = document.createElement("div");
      bar.className = "code-block__bar";
      const label = document.createElement("span");
      label.className = "code-block__label";
      label.textContent = block.label || "code";
      const copy = document.createElement("button");
      copy.className = "code-block__copy";
      copy.type = "button";
      copy.textContent = "Copy code";
      copy.setAttribute("aria-label", "Copy code block");
      copy.addEventListener("click", async () => {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(block.text);
          } else {
            const area = document.createElement("textarea");
            area.value = block.text;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand("copy");
            area.remove();
            if (!copied) throw new Error("Copy command failed");
          }
          copy.textContent = "Copied!";
        } catch (error) {
          copy.textContent = "Copy failed";
        }
        window.setTimeout(() => { copy.textContent = "Copy code"; }, 1400);
      });
      bar.append(label, copy);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.innerHTML = highlightCode(block.text);
      pre.appendChild(code);
      wrapper.append(bar, pre);
      root.appendChild(wrapper);
      firstTextBlock = false;
    }
  });

  if (!root.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "detail__d2--empty";
    empty.textContent = "No detailed description has been added yet.";
    root.appendChild(empty);
  }
  return root;
}
