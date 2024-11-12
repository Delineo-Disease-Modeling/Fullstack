import './App.css';

import AOS from 'aos';
import 'aos/dist/aos.css';

import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './components/navbar.jsx'
import Footer from './components/footer.jsx';

import Home from './pages/home.jsx';
import Simulator from './pages/simulator.jsx';
import Team from './pages/team.jsx';
import About from './pages/about.jsx';

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