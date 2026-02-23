'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import type { CachedUser } from '@/stores/useAuthStore';
import useAuthStore from '@/stores/useAuthStore';
import LoginModal from './login-modal';

import '@/styles/navbar.css';

export default function Navbar({ initialUser }: { initialUser: CachedUser | null }) {
  const [modalOpen, setModalOpen] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

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
              <div className="user-dropdown-container" ref={dropdownRef}>
                <button className="link" onClick={() => setDropdownOpen((v) => !v)}>
                  Hi, {user.name}!
                </button>
                {dropdownOpen && (
                  <div className="user-dropdown">
                    <p className="user-dropdown-name">{user.name}</p>
                    <p className="user-dropdown-org italic">{user.organization}</p>
                    <button
                      className="user-dropdown-logout"
                      onClick={() => {
                        signOut();
                        setUser(null);
                        setDropdownOpen(false);
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        </ul>
      </nav>
      <LoginModal
        isOpen={modalOpen === 'login'}
        onRequestClose={() => setModalOpen('')}
      />
    </div>
  );
}
