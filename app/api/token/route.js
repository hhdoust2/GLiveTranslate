import { GoogleGenAI } from "@google/genai";

// این route کلید API را از کلاینت می‌گیرد (روی HTTPS، پس رمزنگاری‌شده
// در انتقال است)، فقط برای همین یک درخواست استفاده می‌کند، آن را در
// جایی لاگ یا ذخیره نمی‌کند، و در ازایش یک توکن کوتاه‌عمر (Ephemeral
// Token) برمی‌گرداند که مرورگر با آن مستقیماً به Gemini Live API وصل
// می‌شود — یعنی کلید اصلی هیچ‌وقت روی اتصال WebSocket واقعی سفر نمی‌کند.
export async function POST(request) {
  try {
    const { targetLanguage, apiKey } = await request.json().catch(() => ({}));

    // کلید فقط از بدنه‌ی همین درخواست خوانده می‌شود، هیچ‌جا لاگ یا
    // ذخیره نمی‌شود، و پس از ساختن توکن از حافظه‌ی سرور خارج می‌شود.
    if (!apiKey || typeof apiKey !== "string") {
      return Response.json(
        { error: "کلید API ارسال نشده است." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
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
