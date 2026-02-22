'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Modal from 'react-modal';
import { signOut, useSession } from '@/lib/auth-client';
import type { CachedUser } from '@/stores/useAuthStore';
import useAuthStore from '@/stores/useAuthStore';
import LoginModal from './login-modal';

import '@/styles/navbar.css';

export default function Navbar({ initialUser }: { initialUser: CachedUser | null }) {
  const [modalOpen, setModalOpen] = useState('');
  const pathname = usePathname();

  const { data: session, isPending } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

  // Use the server-fetched user while the client session request is in-flight
  // so the navbar never flashes "Login" on page load.
  const user = isPending ? initialUser : (session?.user ?? null);

  const navLink = (href: string, label: string) => (
    <Link href={href} className={`link${pathname === href ? ' active' : ''}`}>
      {label}
    </Link>
  );

  return (
    <div>
      <div className="navbuffer"></div>
      <nav>
        <Link href="/" className="link">
          <Image src="/images/logo.png" alt="logo" width={25} height={25} />
        </Link>
        <ul>
          <li>{navLink('/simulator', 'Simulator')}</li>
          <li>{navLink('/about', 'About')}</li>
          <li>{navLink('/team', 'Team')}</li>
          <li>
            {!user ? (
              <button className="link" onClick={() => setModalOpen('login')}>
                Login
              </button>
            ) : (
              <button className="link" onClick={() => setModalOpen('logout')}>
                Hi, {user.name}!
              </button>
            )}
          </li>
        </ul>
      </nav>
      <LoginModal
        isOpen={modalOpen === 'login'}
        onRequestClose={() => setModalOpen('')}
      />
      <Modal
        ariaHideApp={false}
        style={{
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999
          },
          content: {
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            marginRight: '-50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '80vw',
            borderRadius: '0.5rem',
            background: 'var(--color-bg-dark)',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-text-light)',
            maxHeight: '90vh',
            overflowY: 'scroll'
          }
        }}
        isOpen={modalOpen === 'logout'}
        onRequestClose={() => setModalOpen('')}
        closeTimeoutMS={100}
      >
        <div className="flex flex-col gap-4 items-center">
          <header>Are you sure you want to logout?</header>
          <div className="flex gap-4 w-full justify-center">
            <button className="modal" onClick={() => setModalOpen('')}>
              Cancel
            </button>
            <button
              className="modal bg-red-400"
              onClick={() => {
                signOut();
                setUser(null);
                setModalOpen('');
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
