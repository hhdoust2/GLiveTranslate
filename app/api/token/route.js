// این route فایل ویدیو را از آدرس اصلی (که ممکن است CORS نداشته باشد،
// مثل GitHub Releases) سمت سرور می‌گیرد و با آدرس هم‌مبدأ (خودِ همین
// سایت) به مرورگر تحویل می‌دهد. چون منبع نهایی هم‌مبدأ می‌شود، دیگر
// نیازی به crossOrigin در تگ <video> و بدون نیاز به CORS از سمت مبدأ
// اصلی، هم پخش ویدیو و هم گرفتن صدای آن برای ترجمه ممکن می‌شود.
//
// ⚠️ توجه امنیتی: این route هر URL دلخواهی را fetch می‌کند (یک
// «Open Proxy» ساده است). برای استفاده‌ی شخصی خودتان مشکلی ندارد، ولی
// اگر این پروژه را عمومی/برای دیگران هم دیپلوی می‌کنید، بهتر است یک
// محدودیت دامنه یا احراز هویت رویش بگذارید تا کسی از سرور شما برای
// دور زدن CORS سایت‌های دیگر سوءاستفاده نکند.

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response("پارامتر url معتبر نیست", { status: 400 });
  }

  const fwdHeaders = {};
  const range = request.headers.get("range");
  if (range) fwdHeaders["range"] = range;

  let upstream;
  try {
    upstream = await fetch(target, { headers: fwdHeaders, redirect: "follow" });
  } catch (err) {
    return new Response("خطا در دریافت ویدیو از مبدأ: " + err.message, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("مبدأ ویدیو خطا داد (status " + upstream.status + ")", {
      status: upstream.status,
    });
  }

  const respHeaders = new Headers();
  const passthrough = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  if (!respHeaders.has("accept-ranges")) respHeaders.set("accept-ranges", "bytes");
  if (!respHeaders.has("content-type")) respHeaders.set("content-type", "video/mp4");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
