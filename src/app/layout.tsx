import type { Metadata } from "next";
import Header from '@/components/Header';
import FontLoader from '../components/FontLoader';
import "../../styles/globals.css"; // Updated path

export const metadata: Metadata = {
  title: "The Dot Creative Agency",
  description: "Digital design agency in Ontario, Canada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-raw-white text-copy font-real-text">
        <FontLoader />
        <Header />
        {children}
      </body>
    </html>
  );
}
