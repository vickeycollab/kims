import "./globals.css";

export const metadata = {
  title: "오답 확인",
  description: "정답을 공개하지 않고 오답 문항만 확인하는 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
