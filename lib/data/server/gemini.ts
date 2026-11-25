/**
 * Gọi Gemini REST (JSON mode) dùng chung cho hỏi đáp và dịch (C1-08).
 *
 * Giữ nguyên hình dạng điểm cuối, header x-goog-api-key, generationConfig
 * JSON mode (responseMimeType + responseSchema) và timeout 60 giây như
 * summarize.ts — hình dạng đã chạy thật ở C1-05. Tách file riêng để KHÔNG
 * đụng luồng ASR đã merge (summarize.ts giữ nguyên bản của nó).
 *
 * Model: GEMINI_MODEL nếu đặt, mặc định `gemini-3.5-flash-lite` (khớp
 * summarize.ts; khóa và model thật đặt trên Vercel, không ghi vào repo).
 *
 * Quy tắc nhật ký: không ghi câu hỏi, câu trả lời, bản chữ hay bản dịch;
 * chỉ ghi độ trễ, số ký tự, mã lỗi.
 */
import { ApiError } from "./context";
import { GeminiError } from "./summarize";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

/** Gọi MỘT lần generateContent với JSON mode; trả text JSON thô. */
export async function geminiJsonCall(opts: {
  system: string;
  user: string;
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  /** Nhãn nhật ký, ví dụ "chat" hoặc "translate" */
  logTag: string;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, "ai_not_configured", "Máy chủ chưa cấu hình khóa AI");
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base}/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: opts.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new GeminiError("call", undefined, error instanceof Error ? error.message.slice(0, 120) : "lỗi mạng");
  }
  if (!res.ok) throw new GeminiError("call", res.status, `HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("call", res.status, "phản hồi trống");
  console.log(`[${opts.logTag}] gemini ok ${JSON.stringify({ ms: Date.now() - started, chars: text.length, ts: new Date().toISOString() })}`);
  return text;
}
