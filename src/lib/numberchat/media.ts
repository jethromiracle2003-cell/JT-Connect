export async function compressImage(file: File, maxEdge: number, maxLen: number) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG.");
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    let quality = 0.72;
    let url = canvas.toDataURL("image/jpeg", quality);
    while (url.length > maxLen && quality > 0.42) {
      quality -= 0.1;
      url = canvas.toDataURL("image/jpeg", quality);
    }
    if (url.length > maxLen) throw new Error("That image is too large");
    return url;
  } finally {
    bitmap.close();
  }
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that recording"));
    reader.readAsDataURL(blob);
  });
}
