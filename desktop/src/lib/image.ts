/** Client-side image downscaling (no image parsing on the backend). */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Bild konnte nicht gelesen werden."));
    };
    img.src = url;
  });
}

function squareJpeg(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar.");
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.88).split(",")[1] ?? "";
}

export async function prepareProfilePhoto(file: File): Promise<{ image_base64: string; thumbnail_base64: string; mime_type: "image/jpeg" }> {
  if (!file.type.startsWith("image/")) throw new Error("Bitte wähle eine Bilddatei aus.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Das Bild ist zu groß (max. 25 MB).");
  const img = await loadImage(file);
  return { image_base64: squareJpeg(img, 512), thumbnail_base64: squareJpeg(img, 128), mime_type: "image/jpeg" };
}
