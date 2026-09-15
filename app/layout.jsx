import "./globals.css";

export const metadata = {
  title: "ترجمه‌ی زنده‌ی ویدیو با Gemini",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
