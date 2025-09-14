export const metadata = {
  title: "Animal Guessr",
  description: "Guess the animal from the photo — not just the basics.",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
