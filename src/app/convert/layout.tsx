import type { Metadata } from 'next';
import './convert.css';

export const metadata: Metadata = {
  title: 'Quick Convert - PinBridge',
  description: 'Convert saved places between Google Maps and Apple Maps instantly',
};

export default function ConvertLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
