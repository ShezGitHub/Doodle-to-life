import { GoogleGenAI } from "@google/genai";

export async function checkApiKey() {
  return true; // Always true as we use the server-side key
}

export async function openApiKeySelector() {
  // No-op
}

export async function validateContent(
  imageBytes: string,
  mimeType: string,
  parentContext: string
): Promise<{ safe: boolean; reason?: string }> {
  // Safety check disabled - allow all content through
  console.log("Safety check bypassed for content");
  return { safe: true };
}

export async function generateDoodleVideo(
  imageBytes: string,
  mimeType: string,
  parentContext: string,
  drawingPrompt?: string
) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Construct a prompt that emphasizes the "popping out of the page" effect
  const basePrompt = drawingPrompt ? `The drawing is of: ${drawingPrompt}. ` : "";
  const context = parentContext ? `Additional context: ${parentContext}. ` : "";
  const fullPrompt = `${basePrompt}${context}Animate this child's drawing. The character or object should magically pop out of the paper and come to life in a 3D space, while keeping the charming hand-drawn aesthetic. The animation should be vibrant, playful, and high-quality.`;

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: fullPrompt,
      image: {
        imageBytes,
        mimeType,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    // Polling for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No video generated");

    // Fetch the video
    const response = await fetch(downloadLink);

    if (!response.ok) throw new Error("Failed to download video");
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Error generating video:", error);
    throw error;
  }
}
