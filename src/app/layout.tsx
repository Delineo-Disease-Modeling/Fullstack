import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AOSInit } from '@/components/aos-init';
import AuthProvider from '@/components/auth-provider';
import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import { auth } from '@/lib/auth';
import type { CachedUser } from '@/stores/useAuthStore';
import './globals.css';

export const viewport = {
  viewportFit: 'cover'
};

export const metadata: Metadata = {
  title: 'Delineo',
  description: 'Community-level disease modeling'
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const initialUser: CachedUser | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        organization: (session.user as any).organization ?? ''
      }
    : null;

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AOSInit />
        <AuthProvider>
          <Navbar initialUser={initialUser} />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
