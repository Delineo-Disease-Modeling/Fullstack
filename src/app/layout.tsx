import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AOSInit } from '@/components/aos-init';
import AuthProvider from '@/components/auth-provider';
import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import { auth } from '@/lib/auth';
import type { CachedUser } from '@/stores/useAuthStore';
import './globals.css';

type SessionUserWithOrganization = {
  id: string;
  name: string;
  email: string;
  organization?: string | null;
};

export const viewport = {
  viewportFit: 'cover'
};

export const metadata: Metadata = {
  title: {
    default: 'Delineo',
    template: '%s | Delineo'
  },
  description: 'Community-level disease modeling'
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionUser = session?.user as SessionUserWithOrganization | undefined;
  const initialUser: CachedUser | null = sessionUser
    ? {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        organization: sessionUser.organization ?? ''
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
          href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&family=Poppins:wght@300;400;500;600;700&display=swap"
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
