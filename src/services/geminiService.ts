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
  // Use gemini-flash-latest for multimodal safety checks as it's highly stable
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBytes,
              mimeType: mimeType,
            },
          },
          {
            text: `You are a content moderator for a creative drawing app.
            Analyze this drawing image and the following context: "${parentContext}".

            Determine if the content is appropriate. Only reject if it contains:
            - Explicit sexual content
            - Extreme violence or gore
            - Hate symbols or hateful content

            Simple drawings, stick figures, cartoons, animals, and typical children's drawings should be APPROVED.

            Respond with a JSON object containing:
            1. "safe": a boolean (true if appropriate, false if clearly inappropriate)
            2. "reason": a brief explanation if not safe. If safe, leave this empty.

            Be permissive with simple drawings. Output ONLY the JSON.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }
    });

    const text = response.text;
    if (!text) {
      console.warn("Empty response from safety check, allowing content");
      return { safe: true };
    }

    const result = JSON.parse(text.trim());
    return result;
  } catch (error: any) {
    console.error("Safety check error:", error);

    // If Gemini itself blocked the content due to safety, respect that
    if (error?.message?.includes('SAFETY') || error?.status === 400) {
      return {
        safe: false,
        reason: "This drawing doesn't pass our safety guidelines. Try something different!"
      };
    }

    // For other errors (network, API issues), allow the content through
    console.warn("Safety check failed with non-safety error, allowing content");
    return { safe: true };
  }
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
