import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import LandingPage from "@/pages/LandingPage";
import EmbedPage from "@/pages/EmbedPage";

function App() {
  return (
    <div className="App bg-[#0B0C0E] min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/embed" element={<EmbedPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" toastOptions={{
        style: { background: '#14161A', border: '1px solid rgba(229,223,213,0.12)', color: '#F5F3EF' }
      }} />
    </div>
  );
}

export default App;
