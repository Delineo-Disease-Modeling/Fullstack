import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useSession, signOut } from '../lib/auth-client';
import Modal from 'react-modal';
import LoginModal from './login-modal';

import '../styles/navbar.css';

Modal.setAppElement(document.getElementById('root'));

export default function Navbar() {
  const [modalOpen, setModalOpen] = useState('');

  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div>
      <div className="navbuffer"></div>
      <nav>
        <NavLink to="/" className="link">
          <img src="./logo.png" alt="logo"></img>
        </NavLink>
        <ul>
          <li>
            <NavLink to="/simulator" className="link">
              Simulator
            </NavLink>
          </li>
          <li>
            <NavLink to="/about" className="link">
              About
            </NavLink>
          </li>
          <li>
            <NavLink to="/team" className="link">
              Team
            </NavLink>
          </li>
          <li>
            {!user ? (
              <NavLink
                className="link"
                onClick={() => setModalOpen(() => 'login')}
              >
                Login
              </NavLink>
            ) : (
              <NavLink
                className="link"
                onClick={() => setModalOpen(() => 'logout')}
              >
                Hi, {user.name}!
              </NavLink>
            )}
          </li>
        </ul>
      </nav>
      <LoginModal
        isOpen={modalOpen === 'login'}
        onRequestClose={() => setModalOpen('')}
      />
      <Modal
        style={{
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            backdropFilter: 'blur(10px)',
            zIndex: '9999'
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
