import "./globals.css";

export const metadata = {
  title: "대시나루 국어학원 | 숙제 오답 확인",
  description: "대시나루 국어학원의 반별 숙제 오답 확인 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
