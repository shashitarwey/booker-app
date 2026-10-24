import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import SellersPage from './pages/SellersPage';
import SellerLedgerPage from './pages/SellerLedgerPage';
import KhataPage from './pages/KhataPage';
import PersonDetailPage from './pages/PersonDetailPage';
import SpendReportPage from './pages/SpendReportPage';
import KhataDetailPage from './pages/KhataDetailPage';
import ProfilePage from './pages/ProfilePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import OrderAnalyticsPage from './pages/OrderAnalyticsPage';
import ActivityLogPage from './pages/ActivityLogPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Navbar from './components/Navbar';
import ErrorBoundary from './common/ErrorBoundary';
import { Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

export default function App() {
  const { user } = useAuth();

  const toaster = (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
        },
      }}
    />
  );

  // Unauthenticated routes
  if (!user) {
    return (
      <>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
        {toaster}
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="app-main">
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/people" element={<Navigate to="/people/family" replace />} />
          <Route path="/people/:id" element={<PersonDetailPage />} />
          <Route path="/reports/spends" element={<SpendReportPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/sellers" element={<SellersPage />} />
          <Route path="/sellers/:id/ledger" element={<SellerLedgerPage />} />
          <Route path="/khata" element={<KhataPage />} />
          <Route path="/khata/:id" element={<KhataDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/change-password" element={<ChangePasswordPage />} />
          <Route path="/analytics" element={<OrderAnalyticsPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      </div>
      {toaster}
    </>
  );
}
