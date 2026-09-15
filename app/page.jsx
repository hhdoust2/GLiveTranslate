"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "gemini_api_key";

const LANGS = [
  { code: "fa", label: "فارسی" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "tr", label: "Türkçe" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

// --- کمک‌تابع‌های صوتی ---

function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsampleBuffer(buffer, inRate, outRate) {
  if (outRate === inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLen) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function int16ArrayToBase64(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToInt16Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// پخش پیوسته‌ی تکه‌های صوتی خروجی بدون قطع‌شدگی
class OutputPlayer {
  constructor(sampleRate = 24000) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
    this.playhead = this.ctx.currentTime;
  }
  push(int16Array) {
    const float32 = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) float32[i] = int16Array[i] / 0x8000;
    const buffer = this.ctx.createBuffer(1, float32.length, this.ctx.sampleRate);
    buffer.copyToChannel(float32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const startAt = Math.max(this.playhead, this.ctx.currentTime);
    src.start(startAt);
    this.playhead = startAt + buffer.duration;
  }
  close() {
    this.ctx.close();
  }
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [lang, setLang] = useState("fa");
  const [status, setStatus] = useState("آماده");
  const [subtitle, setSubtitle] = useState("");
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [rememberKey, setRememberKey] = useState(false);

  // فقط اگر قبلاً کاربر انتخاب کرده که ذخیره بشه، از localStorage می‌خوانیم
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setApiKey(saved);
      setRememberKey(true);
    }
  }, []);

  function handleApiKeyChange(value) {
    setApiKey(value);
    if (rememberKey) window.localStorage.setItem(STORAGE_KEY, value);
  }

  function handleRememberToggle(checked) {
    setRememberKey(checked);
    if (checked) {
      window.localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const captureCtxRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const playerRef = useRef(null);

  async function start() {
    if (!videoUrl) return;
    if (!apiKey) {
      setStatus("کلید API را وارد کنید.");
      return;
    }
    setStatus("در حال گرفتن توکن...");

    // کلید فقط همین یک‌بار، روی HTTPS، به route خودمان می‌رود تا
    // Ephemeral Token بسازد؛ در جایی ذخیره یا لاگ نمی‌شود.
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: lang, apiKey }),
    });
    const data = await res.json();
    if (!data.token) {
      setStatus("خطا در گرفتن توکن: " + (data.error || "نامشخص"));
      return;
    }

    setStatus("در حال اتصال به Gemini Live...");

    // نکته: این endpoint مخصوص توکن‌های "Constrained" است (تنظیمات از قبل
    // در توکن قفل شده). اگر خطای اتصال گرفتید، مستندات فعلی را چک کنید:
    // https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${data.token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("متصل شد — در حال شروع پخش و ترجمه...");
      videoRef.current.play();
      startCapture();
    };

    ws.onmessage = async (event) => {
      let msg;
      try {
        const text = typeof event.data === "string" ? event.data : await event.data.text();
        msg = JSON.parse(text);
      } catch {
        return;
      }

      // اگر سرور خطا برگردونه (مثلاً مدل/فیلد نامعتبر)، این‌جا معلوم می‌شود
      if (msg.error) {
        console.error("Gemini server error:", msg.error);
        setStatus("خطای سرور: " + (msg.error.message || JSON.stringify(msg.error)));
        return;
      }

      const sc = msg.serverContent;
      if (!sc) return;

      // صدای ترجمه‌شده
      const parts = sc.modelTurn?.parts || [];
      for (const p of parts) {
        if (p.inlineData?.data) {
          const pcm = base64ToInt16Array(p.inlineData.data);
          playerRef.current?.push(pcm);
        }
      }

      // زیرنویس متنی (اگر مدل ترنسکریپت هم برگرداند)
      if (sc.outputTranscription?.text) {
        setSubtitle((prev) => (prev + " " + sc.outputTranscription.text).slice(-200));
      }
    };

    ws.onerror = (e) => {
      console.error("WebSocket error event:", e);
      setStatus("خطا در اتصال WebSocket — کنسول مرورگر (F12) را چک کنید");
    };
    ws.onclose = (e) => {
      console.error("WebSocket closed:", { code: e.code, reason: e.reason, wasClean: e.wasClean });
      setStatus(
        `اتصال بسته شد — کد: ${e.code}${e.reason ? " | دلیل: " + e.reason : " (دلیلی از سرور نیامد)"}`
      );
    };

    playerRef.current = new OutputPlayer(24000);
    setRunning(true);
  }

  function startCapture() {
    const video = videoRef.current;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    captureCtxRef.current = audioCtx;

    // صدای اصلی ویدیو را قطع می‌کنیم تا با صدای ترجمه‌شده قاطی نشود
    video.muted = true;

    const source = audioCtx.createMediaElementSource(video);
    sourceRef.current = source;

    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleBuffer(input, audioCtx.sampleRate, 16000);
      const pcm16 = floatTo16BitPCM(down);
      const b64 = int16ArrayToBase64(pcm16);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            realtimeInput: {
              audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
            },
          })
        );
      }
    };

    source.connect(processor);
    // processor باید به یک مقصد وصل باشد تا onaudioprocess اجرا شود،
    // ولی چون خروجی صفر نمی‌فرستیم صدای اضافه‌ای پخش نمی‌شود:
    processor.connect(audioCtx.destination);
  }

  function stop() {
    wsRef.current?.close();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    captureCtxRef.current?.close();
    playerRef.current?.close();
    videoRef.current?.pause();
    setRunning(false);
    setStatus("متوقف شد");
  }

  return (
    <div className="wrap">
      <h2>ترجمه‌ی زنده‌ی ویدیو (Gemini 3.5 Live Translate)</h2>

      <div className="row">
        <input
          type={showKey ? "text" : "password"}
          placeholder="کلید Gemini API خودتان را وارد کنید"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          disabled={running}
          autoComplete="off"
        />
        <button type="button" onClick={() => setShowKey((s) => !s)}>
          {showKey ? "پنهان کن" : "نمایش"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={rememberKey}
            onChange={(e) => handleRememberToggle(e.target.checked)}
            disabled={running}
          />
          در همین مرورگر ذخیره شود
        </label>
      </div>

      <div className="row">
        <input
          type="text"
          placeholder="لینک مستقیم فایل ویدیو (mp4/webm با CORS فعال)"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          disabled={running}
        />
        <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={running}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {!running ? (
          <button onClick={start}>شروع</button>
        ) : (
          <button onClick={stop}>توقف</button>
        )}
      </div>

      <video ref={videoRef} src={videoUrl} crossOrigin="anonymous" controls />

      <div className="status">{status}</div>
      <div className="subtitle">{subtitle}</div>
    </div>
  );
}
