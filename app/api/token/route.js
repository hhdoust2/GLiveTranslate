import { GoogleGenAI } from "@google/genai";

// این route هرگز کلید اصلی را به کلاینت نمی‌فرستد؛
// فقط یک توکن کوتاه‌عمر (Ephemeral Token) می‌سازد که مرورگر
// می‌تواند مستقیماً با آن به Gemini Live API وصل شود.
export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY در تنظیمات Vercel ست نشده است." },
        { status: 500 }
      );
    }

    const { targetLanguage } = await request.json().catch(() => ({}));

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString(); // ۳۰ دقیقه برای ارسال پیام
    const newSessionExpireTime = new Date(now + 60 * 1000).toISOString(); // ۱ دقیقه برای شروع سشن

    // نکته: این API هنوز Preview است. اگر نام فیلدها (مثل targetLanguageCode)
    // در SDK فعلی شما فرق دارد، طبق خطای برگشتی اصلاحش کنید —
    // مستندات رسمی: https://ai.google.dev/gemini-api/docs/live-api/live-translate
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: "gemini-3.5-live-translate-preview",
          config: {
            responseModalities: ["AUDIO"],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            translationConfig: {
              targetLanguageCode: targetLanguage || "fa",
              echoTargetLanguage: true,
            },
          },
        },
      },
    });

    return Response.json({ token: token.name });
  } catch (err) {
    console.error("token error:", err);
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
