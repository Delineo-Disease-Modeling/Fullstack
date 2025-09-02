import Modal from 'react-modal';

import './login-modal.css';
import { useState } from 'react';

Modal.setAppElement(document.getElementById('root'));

function FormData({ curTab }) {
  const login = (formdata) => {
    console.log(formdata);
  }

  const register = (formdata) => {
    console.log(formdata);
  }

  return (
    <form
      action={curTab === 0 ? login : register}
      className='flex flex-col gap-4 items-center'
    >
      <div className='flex flex-col gap-1'>
        <label htmlFor='email'>Email</label>
        <input
          id='email'
          name='email'
          type='email'
          className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
        />
      </div>
      {curTab === 1 && (
        <div className='flex flex-col gap-1'>
          <label htmlFor='username'>Display Name</label>
          <input
            id='username'
            name='username'
            type='text'
            className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
          />
        </div>
      )}
      <div className='flex flex-col gap-1'>
        <label htmlFor='password'>Password</label>
        <input
          id='password'
          name='password'
          type='password'
          className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
        />
      </div>
      <button
        type='submit'
        className='w-fit outline-solid outline-1 px-8 py-1 rounded-lg mt-2'
      >
        {curTab === 0 ? 'Login' : 'Register'}
      </button>
    </form>
  );
}

export default function LoginModal({ isOpen, onRequestClose }) {
  // 0 = login, 1 = signup
  const [curTab, setCurTab] = useState(0);

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
          background: '#222629',
          border: '1px solid #F0F0F0',
          color: '#F0F0F0'
        }
      }}
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      closeTimeoutMS={100}
    >
      <div className='flex flex-col gap-4 items-center'>
        <header>Login or Register</header>
        <div className='flex gap-4 w-full'>
          <button
            onClick={() => setCurTab(0)}
            data-tab={curTab}
            className='cursor-pointer underline underline-offset-8 decoration-2 data-[tab=0]:decoration-[#70B4D4]'
          >
            Login
          </button>
          <button
            onClick={() => setCurTab(1)}
            data-tab={curTab}
            className='cursor-pointer underline underline-offset-8 decoration-2 data-[tab=1]:decoration-[#70B4D4]'
          >
            Register
          </button>
        </div>
        <FormData curTab={curTab} />
      </div>
    </Modal>
  );
}
