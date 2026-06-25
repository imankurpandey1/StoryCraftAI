export function copyText(text) {
  return navigator.clipboard.writeText(text);
}

export function downloadTxt(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(filename, title, text) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(title || "JananiAI Story", 14, 18);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  let y = 30;
  lines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 18;
    }
    doc.text(line, 14, y);
    y += 7;
  });
  doc.save(filename);
}

export function readingLabel(minutes) {
  return `${Number(minutes || 0).toFixed(1)} min read`;
}
