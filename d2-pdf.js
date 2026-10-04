/* Attractive A4 PDF export for D2 content. Requires jsPDF and parseD2(). */
const PDF_MARGIN = 20;
const PDF_TEAL = [13, 124, 134];
const PDF_INK = [18, 32, 47];
const PDF_GREY = [91, 107, 123];

function pdfSafe(text) {
  return String(text ?? "")
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-").replace(/…/g, "...")
    .replace(/→/g, "->").replace(/←/g, "<-")
    .replace(/[•●▪]/g, "*").replace(/[✓✔]/g, "v")
    .replace(/\u00a0/g, " ").replace(/\t/g, "    ")
    .replace(/[^\x00-\xff]/g, "?");
}

function stripInline(text) {
  return String(text ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

function pdfFileName({ label, title }) {
  const name = `${label || "Experiment"} ${title || "Description"} D2`
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${name || "Experiment_D2"}.pdf`;
}

function buildD2Pdf({ label, title, heading, content }) {
  if (!window.jspdf?.jsPDF) throw new Error("jsPDF is not loaded.");
  if (typeof parseD2 !== "function") throw new Error("parseD2() is unavailable.");

  const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - PDF_MARGIN * 2;
  const bottomLimit = pageHeight - PDF_MARGIN - 7;
  let y = PDF_MARGIN;

  doc.setProperties({ title: pdfSafe(`${label || "Experiment"}: ${title || "Description"} - ${heading || "D2"}`) });

  function ensureSpace(height) {
    if (y + height > bottomLimit) { doc.addPage(); y = PDF_MARGIN; }
  }
  function setFont(family, style, size, color) {
    doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color);
  }
  function writeLines(lines, x, leading) {
    lines.forEach((line) => { ensureSpace(leading); y += leading; doc.text(line || " ", x, y - leading * 0.25); });
  }
  function wrap(text, maxWidth) { return doc.splitTextToSize(String(text || " "), maxWidth); }

  // Header
  setFont("helvetica", "bold", 10, PDF_TEAL);
  writeLines([pdfSafe(label || "EXPERIMENT")], PDF_MARGIN, 5);
  setFont("helvetica", "bold", 20, PDF_INK);
  writeLines(wrap(pdfSafe(title || "Untitled Experiment"), width), PDF_MARGIN, 8.5);
  y += 3;
  setFont("helvetica", "bold", 13, PDF_TEAL);
  writeLines(wrap(pdfSafe(heading || "Detailed Description"), width), PDF_MARGIN, 6.5);
  y += 2;
  ensureSpace(8);
  doc.setDrawColor(...PDF_TEAL); doc.setLineWidth(0.7);
  doc.line(PDF_MARGIN, y, pageWidth - PDF_MARGIN, y);
  y += 6;

  parseD2(content).forEach((block) => {
    if (block.type === "heading") {
      y += 2; ensureSpace(14);
      setFont("helvetica", "bold", 12, PDF_TEAL);
      writeLines(wrap(pdfSafe(block.text), width), PDF_MARGIN, 6.2);
      y += 1.5;
    } else if (block.type === "text") {
      setFont("helvetica", "normal", 10.5, PDF_INK);
      block.text.split("\n").forEach((line) => {
        if (!line.trim()) { y += 2; return; }
        writeLines(wrap(pdfSafe(stripInline(line)), width), PDF_MARGIN, 5.4);
      });
      y += 2.5;
    } else if (block.type === "list") {
      block.items.forEach((item) => {
        const lines = wrap(pdfSafe(stripInline(item.text)), width - 10);
        setFont("helvetica", "bold", 10.5, PDF_TEAL);
        ensureSpace(5.4);
        doc.text(pdfSafe(item.marker || "*"), PDF_MARGIN, y + 3.9);
        setFont("helvetica", "normal", 10.5, PDF_INK);
        writeLines(lines, PDF_MARGIN + 9, 5.4);
        y += 1;
      });
      y += 2;
    } else if (block.type === "code") {
      y += 2;
      if (block.label) {
        ensureSpace(5);
        setFont("helvetica", "bold", 8, PDF_GREY);
        writeLines([pdfSafe(block.label).toUpperCase()], PDF_MARGIN, 4);
      }
      setFont("courier", "normal", 8.5, [30, 41, 59]);
      const charWidth = doc.getTextWidth("0");
      const maxChars = Math.max(20, Math.floor((width - 6) / charWidth));
      const codeLines = [];
      String(block.text ?? "").split("\n").forEach((raw) => {
        const safe = pdfSafe(raw);
        const match = safe.match(/^ */);
        const indent = " ".repeat(Math.min(match ? match[0].length : 0, 16));
        if (!safe.length) { codeLines.push(""); return; }
        let remaining = safe;
        codeLines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
        while (remaining.length) {
          const chunkSize = Math.max(1, maxChars - indent.length);
          codeLines.push(indent + remaining.slice(0, chunkSize));
          remaining = remaining.slice(chunkSize);
        }
      });
      codeLines.forEach((line) => {
        ensureSpace(4.5);
        doc.setFillColor(241, 245, 249);
        doc.rect(PDF_MARGIN, y, width, 4.5, "F");
        setFont("courier", "normal", 8.5, [30, 41, 59]);
        doc.text(line || " ", PDF_MARGIN + 3, y + 3.2);
        y += 4.5;
      });
      y += 3;
    }
  });

  // Footer with page count
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    setFont("helvetica", "normal", 8, PDF_GREY);
    doc.setDrawColor(220, 228, 235);
    doc.setLineWidth(0.25);
    doc.line(PDF_MARGIN, pageHeight - 15, pageWidth - PDF_MARGIN, pageHeight - 15);
    doc.text(`${title || "Experiment"}`, PDF_MARGIN, pageHeight - 10);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - PDF_MARGIN, pageHeight - 10, { align: "right" });
  }
  return doc;
}

function downloadD2Pdf(options) {
  const userError = (message) => Object.assign(new Error(message), { isPdfMessage: true });
  if (!options?.content || !String(options.content).trim()) {
    throw userError("There is no long description to download for this experiment.");
  }
  if (!window.jspdf?.jsPDF) throw userError("jsPDF could not be loaded. Check the script tag and refresh.");
  if (typeof parseD2 !== "function") throw userError("d2-format.js is missing or did not load correctly.");
  buildD2Pdf(options).save(pdfFileName(options));
}
