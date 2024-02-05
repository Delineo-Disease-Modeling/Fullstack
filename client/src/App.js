import './App.css';

import AOS from 'aos';
import 'aos/dist/aos.css';

import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './components/navbar.js';
import Footer from './components/footer.js';

import Home from './pages/home.js';
import Simulator from './pages/simulator.js';
import Team from './pages/team.js';
import About from './pages/about.js';

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    AOS.init();
    AOS.refresh();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [ pathname ]);

  return (
    <div>
      <Navbar />
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/simulator' element={<Simulator />} />
        <Route path='/team' element={<Team />} />
        <Route path='/about' element={<About />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default App;