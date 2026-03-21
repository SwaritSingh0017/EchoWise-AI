import { Inter } from 'next/font/google'
import "./globals.css"
import 'leaflet/dist/leaflet.css'
import LayoutClient from '@/components/LayoutClient'
import { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'EchoWise - Waste Management',
  description: 'Eco-friendly waste management platform powered by AI.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  )
}
