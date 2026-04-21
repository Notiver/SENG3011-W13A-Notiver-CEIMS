import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Amplify } from 'aws-amplify';
import outputs from '@/amplify_outputs.json';
import "./globals.css";

Amplify.configure(outputs, { ssr: true});
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Notiver CEIMS",
  description: "Cross Event Intelligence Microservice Suite",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
