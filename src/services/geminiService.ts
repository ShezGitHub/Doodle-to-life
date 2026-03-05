export async function validateContent(
  _imageBytes: string,
  _mimeType: string,
  _parentContext: string
): Promise<{ safe: boolean; reason?: string }> {
  return { safe: true };
}

export async function generateDoodleVideo(
  imageBytes: string,
  mimeType: string,
  parentContext: string,
  drawingPrompt?: string
): Promise<{ videoUrl: string; credits: number }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBytes, mimeType, parentContext, drawingPrompt }),
  });

  if (res.status === 402) {
    throw Object.assign(new Error("no_credits"), { code: "no_credits" });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Video generation failed");
  }

  return res.json();
}
