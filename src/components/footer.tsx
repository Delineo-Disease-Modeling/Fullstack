'use client';

import Image from 'next/image';
import Link from 'next/link';
import '@/styles/footer.css';

export default function Footer() {
  return (
    <footer className="site_footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-brand-row">
            <Image
              src="/images/logo.png"
              alt="Delineo"
              width={24}
              height={24}
            />
            <span className="footer-brand-name">Delineo</span>
          </div>
          <p className="footer-tagline">
            Community-level infectious disease modeling.
          </p>
        </div>

        <div className="footer-cols">
          <div className="footer-col">
            <h4 className="footer-col-title">Pages</h4>
            <Link href="/simulator" className="footer-link">
              Simulator
            </Link>
            <Link href="/cz-generation" className="footer-link">
              CZ Generator
            </Link>
            <Link href="/about" className="footer-link">
              About
            </Link>
            <Link href="/team" className="footer-link">
              Team
            </Link>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Resources</h4>
            <a
              href="https://github.com/Delineo-Disease-Modeling/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              GitHub
            </a>
            <a
              href="https://github.com/Delineo-Disease-Modeling/Fullstack#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              Documentation
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="footer-copy">
          © {new Date().getFullYear()} Delineo Disease Modeling
        </span>
        <a
          href="https://github.com/Delineo-Disease-Modeling/"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-icon-link"
          aria-label="GitHub"
        >
          <i className="bi-github"></i>
        </a>
      </div>
    </footer>
  );
}
