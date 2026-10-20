import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import LandingPage from "@/pages/LandingPage";
import EmbedPage from "@/pages/EmbedPage";
import AdminPage from "@/pages/AdminPage";
import LegalPage from "@/pages/LegalPage";
import SmsPage from "@/pages/SmsPage";
import AuditReportPage from "@/pages/AuditReportPage";
import BookPage from "@/pages/BookPage";
import PortalPage from "@/pages/PortalPage";
import PlanPage from "@/pages/PlanPage";

function App() {
  return (
    <div className="App bg-[#0B0C0E] min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/embed" element={<EmbedPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/sms" element={<SmsPage />} />
          <Route path="/audit/:id" element={<AuditReportPage />} />
          <Route path="/book" element={<BookPage />} />
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/plan" element={<PlanPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" toastOptions={{
        style: { background: '#14161A', border: '1px solid rgba(229,223,213,0.12)', color: '#F5F3EF' }
      }} />
    </div>
  );
}

export default App;
