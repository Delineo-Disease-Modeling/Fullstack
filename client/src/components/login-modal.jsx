import { useState } from 'react';
import Modal from 'react-modal';
import useAuth from '../stores/auth';

Modal.setAppElement(document.getElementById('root'));

function FormData({ curTab, closeModal }) {
  const login = useAuth((state) => state.login);
  const register = useAuth((state) => state.register);

  const formSubmit = (formdata) => {
    const request = {};
    formdata.forEach((value, key) => request[key] = value);

    if (curTab === 0) {
      login(request)
        .then(closeModal)
        .catch(console.error);
    } else {
      register(request)
        .then(closeModal)
        .catch(console.error);
    }
  }

  return (
    <form
      action={formSubmit}
      className='flex flex-col gap-4 items-center'
    >
      <div className='flex flex-col gap-1'>
        <label htmlFor='email'>Email</label>
        <input
          id='email'
          name='email'
          type='email'
          className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
          required
        />
      </div>
      {curTab === 1 && (
        <div className='flex flex-col gap-1'>
          <label htmlFor='name'>Display Name</label>
          <input
            id='name'
            name='name'
            type='text'
            className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
            required
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
          required
        />
      </div>
      {curTab === 1 && <>
        <div className='flex flex-col gap-1'>
          <label htmlFor='organization'>Organization</label>
          <input
            id='organization'
            name='organization'
            type='text'
            className='rounded-md px-2 py-0.5 text-[#222629] bg-[#F0F0F0]'
            required
          />
        </div>
      </>}
      <button
        type='submit'
        className='modal outline-solid outline-1 px-8 py-1 rounded-lg mt-2'
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
          color: '#F0F0F0',
          maxHeight: '90vh',
          overflowY: 'scroll'
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
            className='cursor-pointer underline underline-offset-[10px] decoration-2 rounded-md px-1 py-0.5 data-[tab=0]:decoration-[#70B4D4] hover:bg-slate-700'
            style={{'boxShadow': 'inset 0 -1px 0 0 #313131'}}
          >
            Login
          </button>
          <button
            onClick={() => setCurTab(1)}
            data-tab={curTab}
            className='cursor-pointer underline underline-offset-[10px] decoration-2 rounded-md px-1 py-0.5 data-[tab=1]:decoration-[#70B4D4] hover:bg-slate-700'
          >
            Register
          </button>
        </div>
        <FormData curTab={curTab} closeModal={onRequestClose} />
      </div>
    </Modal>
  );
}
