"use client";

/*
 * Xuất khối hình ở tab Hình ra PNG và chép số liệu (issue M3-03).
 * - Biểu đồ, dòng thời gian, ai nói bao nhiêu, sơ đồ Mermaid đều là SVG:
 *   chép node, vẽ lại vào canvas 2x rồi tải về.
 * - Lưới ảnh: vẽ ảnh vào canvas trực tiếp.
 */

async function svgToCanvas(svg: SVGSVGElement, background: string): Promise<HTMLCanvasElement> {
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(box.width));
  const h = Math.max(1, Math.ceil(box.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const data = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Không vẽ được SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas không dùng được");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Tải một khối SVG ra file PNG (nền theo token của vùng chứa). */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, background: string) {
  const canvas = await svgToCanvas(svg, background);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

/** Tải lưới ảnh đã chụp ra PNG: 3 ảnh mỗi hàng, kèm mốc thời gian. */
export async function downloadPhotosGrid(
  items: Array<{ url: string; time: string }>,
  filename: string,
  background: string,
  ink: string,
) {
  const CELL = 320;
  const LABEL = 40;
  const perRow = 3;
  const rows = Math.ceil(items.length / perRow);
  const canvas = document.createElement("canvas");
  canvas.width = CELL * perRow;
  canvas.height = (CELL + LABEL) * rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  ctx.font = "500 20px 'Be Vietnam Pro', sans-serif";
  await Promise.all(
    items.map(async (item, i) => {
      const x = (i % perRow) * CELL;
      const y = Math.floor(i / perRow) * (CELL + LABEL);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = item.url;
      });
      if (img.width) {
        const scale = Math.max(CELL / img.width, CELL / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, CELL, CELL);
        ctx.clip();
        ctx.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
        ctx.restore();
      }
      ctx.fillStyle = ink;
      ctx.fillText(item.time, x + 12, y + CELL + 26);
    }),
  );
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}
