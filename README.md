# ترجمه‌ی زنده‌ی ویدیو با Gemini 3.5 Live Translate

یک لینک ویدیوی مستقیم (mp4/webm) بده، پخش می‌شود و هم‌زمان صدایش با
Gemini 3.5 Live Translate به زبان انتخابی ترجمه و پخش می‌شود.

## محدودیت‌های مهم (حتماً بخوانید)

1. **فقط لینک مستقیم فایل ویدیو کار می‌کند** (مثلاً یک mp4 که خودتان
   هاست کرده‌اید یا از یک CDN می‌آید). **یوتیوب و سایت‌های مشابه پشتیبانی
   نمی‌شوند** — پلیر یوتیوب صدای خام را در اختیار جاوااسکریپت قرار
   نمی‌دهد، و دانلود جدا از سرور یوتیوب برخلاف قوانین آن سرویس است.

2. **فایل ویدیو باید CORS فعال داشته باشد** (هدر
   `Access-Control-Allow-Origin`)، وگرنه مرورگر اجازه‌ی خواندن صدای خام
   برای پردازش را نمی‌دهد و فقط سکوت ارسال می‌شود.

3. **Gemini 3.5 Live Translate هنوز Preview است.** نام دقیق فیلدها و
   مسیر WebSocket ممکن است در نسخه‌ای که شما استفاده می‌کنید کمی فرق
   داشته باشد. اگر به خطا خوردید، این دو صفحه را چک کنید:
   - https://ai.google.dev/gemini-api/docs/live-api/live-translate
   - https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens

4. تأخیر (Latency) چند صدم ثانیه تا چند ثانیه طبیعی است — این یک مدل
   real-time است نه آفلاین.

## اجرا روی سیستم خودتان

```bash
npm install
cp .env.example .env.local
# GEMINI_API_KEY را داخل .env.local بگذارید
npm run dev
```

سپس `http://localhost:3000` را باز کنید.

## دیپلوی روی GitHub + Vercel

1. یک ریپوی جدید در گیت‌هاب بسازید و این پروژه را push کنید:
   ```bash
   git init
   git add .
   git commit -m "gemini live translate video"
   git branch -M main
   git remote add origin <آدرس ریپوی شما>
   git push -u origin main
   ```

2. در [vercel.com](https://vercel.com) دکمه‌ی **New Project** را بزنید،
   ریپو را انتخاب کنید (چیزی نیاز به تغییر نیست، Vercel خودش Next.js را
   تشخیص می‌دهد).

3. قبل از دیپلوی نهایی، در تنظیمات پروژه در Vercel:
   **Settings → Environment Variables** → یک متغیر با نام
   `GEMINI_API_KEY` و مقدار کلید خودتان (از
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
   اضافه کنید.

4. Deploy بزنید. بعد از اتمام، لینک ویدیوی خودتان را در صفحه بدهید و
   «شروع» را بزنید.

## ساختار پروژه

```
app/
  page.jsx           رابط کاربری + منطق ضبط صدا و اتصال WebSocket
  api/token/route.js  فقط توکن کوتاه‌عمر می‌سازد (کلید اصلی لو نمی‌رود)
```

کلید API هیچ‌وقت به مرورگر فرستاده نمی‌شود؛ فقط یک Ephemeral Token با
عمر ۳۰ دقیقه‌ای که مرورگر مستقیماً با آن به Gemini وصل می‌شود — به همین
خاطر هیچ سروری لازم نیست وسط ترافیک صوتی real-time بایستد، و روی
Vercel (که برای اتصال‌های طولانی WebSocket مناسب نیست) هم به‌خوبی کار
می‌کند.
