'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import type { CachedUser } from '@/stores/useAuthStore';
import useAuthStore from '@/stores/useAuthStore';
import LoginModal from './login-modal';

import '@/styles/navbar.css';

const MENU_CLOSE_DURATION = 150;

export default function Navbar({
  initialUser
}: {
  initialUser: CachedUser | null;
}) {
  const [modalOpen, setModalOpen] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const closeMobileMenu = useCallback(() => {
    setMobileMenuClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setMobileMenuOpen(false);
      setMobileMenuClosing(false);
    }, MENU_CLOSE_DURATION);
  }, []);

  // Cancel any in-flight close timer when opening
  const openMobileMenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMobileMenuClosing(false);
    setMobileMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!dropdownOpen && !mobileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        closeMobileMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    if (!pathname) return;
    setMobileMenuOpen(false);
    setMobileMenuClosing(false);
  }, [pathname]);

  // Clean up close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const { data: session, isPending } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

  // Use the server-fetched user while the client session request is in-flight
  // so the navbar never flashes "Login" on page load.
  const user = isPending ? initialUser : (session?.user ?? null);

  const navLink = (href: string, label: string, onClick?: () => void) => (
    <Link
      href={href}
      className={`link${pathname === href ? ' active' : ''}`}
      onClick={onClick}
    >
      {label}
    </Link>
  );

  const isMenuOpen = mobileMenuOpen && !mobileMenuClosing;

  return (
    <div>
      <div className="navbuffer"></div>
      <nav ref={navRef}>
        <Link href="/" className="nav-brand">
          <Image src="/images/logo.png" alt="logo" width={26} height={26} />
          <span className="nav-brand-name">Delineo</span>
        </Link>

        {/* Desktop links */}
        <ul className="nav-links-desktop">
          <li>{navLink('/simulator', 'Simulator')}</li>
          <li>{navLink('/cz-generation', 'CZ Generator')}</li>
          <li>{navLink('/about', 'About')}</li>
          <li>{navLink('/team', 'Team')}</li>
          <li>
            {!user ? (
              <button
                type="button"
                className="link"
                onClick={() => setModalOpen('login')}
              >
                Login
              </button>
            ) : (
              <div className="user-dropdown-container" ref={dropdownRef}>
                <button
                  type="button"
                  className="link"
                  onClick={() => setDropdownOpen((v) => !v)}
                >
                  Hi, {user.name}!
                </button>
                {dropdownOpen && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-info">
                      <p className="user-dropdown-name">{user.name}</p>
                      <p className="user-dropdown-org">{user.organization}</p>
                    </div>
                    <div className="user-dropdown-divider" />
                    <button
                      type="button"
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

        {/* Hamburger button — mobile only */}
        <button
          type="button"
          className={`hamburger${isMenuOpen ? ' open' : ''}`}
          aria-label="Toggle navigation menu"
          onClick={() => {
            if (mobileMenuOpen) {
              closeMobileMenu();
            } else {
              openMobileMenu();
            }
          }}
        >
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className={`mobile-menu${mobileMenuClosing ? ' closing' : ''}`}>
            <ul className="mobile-menu-list">
              <li>
                {navLink('/simulator', 'Simulator', () =>
                  setMobileMenuOpen(false)
                )}
              </li>
              <li>
                {navLink('/cz-generation', 'CZ Generator', () =>
                  setMobileMenuOpen(false)
                )}
              </li>
              <li>
                {navLink('/about', 'About', () => setMobileMenuOpen(false))}
              </li>
              <li>
                {navLink('/team', 'Team', () => setMobileMenuOpen(false))}
              </li>
              <li>
                {!user ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setModalOpen('login');
                    }}
                  >
                    Login
                  </button>
                ) : (
                  <div className="mobile-user-section">
                    <p className="user-dropdown-name">{user.name}</p>
                    <p className="user-dropdown-org">{user.organization}</p>
                    <button
                      type="button"
                      className="mobile-logout-btn"
                      onClick={() => {
                        signOut();
                        setUser(null);
                        setMobileMenuOpen(false);
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </div>
        )}
      </nav>
      <LoginModal
        isOpen={modalOpen === 'login'}
        onRequestClose={() => setModalOpen('')}
      />
    </div>
  );
}
