'use client';

import '@/styles/footer.css';
import Button from './ui/button';

export default function Footer() {
  return (
    <footer className="site_footer">
      <a
        href="https://github.com/Delineo-Disease-Modeling/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button type="button" className="w-25 p-2!">Github</Button>
      </a>
    </footer>
  );
}
