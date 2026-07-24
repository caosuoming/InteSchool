import { z } from "zod";

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
});

function providerConfig(): { baseUrl: string; apiKey: string; model: string } {
  const baseUrl = process.env.INTESCHOOL_AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.INTESCHOOL_AI_API_KEY;
  const model = process.env.INTESCHOOL_AI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI 服务未配置，请设置 INTESCHOOL_AI_BASE_URL、INTESCHOOL_AI_API_KEY 和 INTESCHOOL_AI_MODEL");
  }
  return { baseUrl, apiKey, model };
}

export async function generateStructuredContent<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, apiKey, model } = providerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AI 服务请求失败（${response.status}）：${detail.slice(0, 300)}`);
    }
    const payload = responseSchema.parse(await response.json());
    let decoded: unknown;
    try {
      decoded = JSON.parse(payload.choices[0].message.content);
    } catch {
      throw new Error("AI 服务未返回合法 JSON");
    }
    return schema.parse(decoded);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI 服务请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
