import { useState } from 'react';
import Modal from 'react-modal';
import { signIn, signUp } from '../lib/auth-client';

Modal.setAppElement(document.getElementById('root'));

function AuthForm({ curTab, closeModal, error, setError }) {
  const formSubmit = async (formdata) => {
    const request = {};
    setError(null);

    formdata.forEach((value, key) => (request[key] = value));

    if (!request.email || !request.password) {
      setError('Please fill in all fields');
      return;
    }

    if (curTab === 1 && (!request.name || !request.organization)) {
      setError('Please fill in all fields');
      return;
    }

    if (request.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      if (curTab === 0) {
        await signIn.email(
          {
            email: request.email,
            password: request.password
          },
          {
            onSuccess: closeModal,
            onError: (ctx) => setError(ctx.error.message)
          }
        );
      } else {
        await signUp.email(
          {
            email: request.email,
            password: request.password,
            name: request.name,
            organization: request.organization
          },
          {
            onSuccess: closeModal,
            onError: (ctx) => setError(ctx.error.message)
          }
        );
      }
    } catch (err) {
      setError('Server unreachable or network error');
      console.error(err);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        formSubmit(formData);
      }}
      className="flex flex-col gap-4 items-center w-full"
    >
      {error && (
        <div className="text-red-500 text-sm font-medium w-full text-center bg-red-500/10 py-2 rounded-md border border-red-500/20">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-1 w-full">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className={`rounded-md px-2 py-0.5 text-[var(--color-bg-dark)] bg-[var(--color-text-light)] ${
            error ? 'border-red-500' : ''
          }`}
          required
        />
      </div>
      {curTab === 1 && (
        <div className="flex flex-col gap-1 w-full">
          <label htmlFor="name">Display Name</label>
          <input
            id="name"
            name="name"
            type="text"
            className="rounded-md px-2 py-0.5 text-[var(--color-bg-dark)] bg-[var(--color-text-light)]"
            required
          />
        </div>
      )}
      <div className="flex flex-col gap-1 w-full">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className={`rounded-md px-2 py-0.5 text-[var(--color-bg-dark)] bg-[var(--color-text-light)] ${
            error ? 'border-red-500' : ''
          }`}
          required
        />
      </div>
      {curTab === 1 && (
        <>
          <div className="flex flex-col gap-1 w-full">
            <label htmlFor="organization">Organization</label>
            <input
              id="organization"
              name="organization"
              type="text"
              className="rounded-md px-2 py-0.5 text-[var(--color-bg-dark)] bg-[var(--color-text-light)]"
              required
            />
          </div>
        </>
      )}
      <button
        type="submit"
        className="modal outline-solid outline-1 px-8 py-1 rounded-lg mt-2 w-full hover:bg-[var(--color-primary-blue)] transition-colors"
      >
        {curTab === 0 ? 'Login' : 'Register'}
      </button>
    </form>
  );
}

export default function LoginModal({ isOpen, onRequestClose }) {
  // 0 = login, 1 = signup
  const [curTab, setCurTab] = useState(0);
  const [error, setError] = useState(null);

  return (
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
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      closeTimeoutMS={100}
    >
      <div className="flex flex-col gap-4 items-center">
        <header>Login or Register</header>
        <div className="flex gap-4 w-full">
          <button
            onClick={() => {
              setCurTab(0);
              setError(null);
            }}
            data-tab={curTab}
            className="cursor-pointer underline underline-offset-10 decoration-2 rounded-md px-1 py-0.5 data-[tab=0]:decoration-[var(--color-primary-blue)] hover:bg-slate-700 w-1/2"
            style={{ boxShadow: 'inset 0 -1px 0 0 #313131' }}
          >
            Login
          </button>
          <button
            onClick={() => {
              setCurTab(1);
              setError(null);
            }}
            data-tab={curTab}
            className="cursor-pointer underline underline-offset-10 decoration-2 rounded-md px-1 py-0.5 data-[tab=1]:decoration-[var(--color-primary-blue)] hover:bg-slate-700 w-1/2"
          >
            Register
          </button>
        </div>
        <AuthForm
          curTab={curTab}
          closeModal={onRequestClose}
          error={error}
          setError={setError}
        />
      </div>
    </Modal>
  );
}
