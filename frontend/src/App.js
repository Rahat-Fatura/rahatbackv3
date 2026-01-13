import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import Login from "./pages/loginPage/loginPage.js";
import ForgotPassword from "./pages/forgotPassword/forgotPassword.js";
import Register from "./pages/registerPage/register.js";
import HomePage from "./pages/homePage/homePage.js";
import ProfilePage from "./pages/profilePage/userProfile.js";
import AdminPage from "./pages/adminPage/adminPage.js";
import AdminUsers from "./pages/adminPage/adminUsers.js";
import AdminSettings from "./pages/adminPage/adminProfilePage.js";
import DatabaseList from "./pages/databases/DatabaseList.js";
import CloudStorageList from "./pages/cloudStorage/CloudStorageList.js";
import BackupJobsList from "./pages/backupJobs/BackupJobsList.js";
import BackupHistoryList from "./pages/backupHistory/BackupHistoryList.js";
import Dashboard from "./pages/dashboard/Dashboard.js";
import EmailNotificationSettings from "./pages/notifications/EmailNotificationSettings.js";
import TwoFactorAuthPage from "./pages/profilePage/TwoFactorAuthPage.js";
import "./App.css";
import { jwtDecode } from "jwt-decode";

import { cookies } from "./utils/cookie";
import LandingPage from "./pages/landingPage/index.js";
import MainLayout from "./layouts/MainLayout.js";
import AdminLayout from "./layouts/AdminLayout.js";
import GridPage from "./pages/gridPageTemplate/index.js";
import ComponentsPage from "./pages/ComponentsPage/index.js";
import websocketService from "./services/websocket.service";
const NotFound = () => {
  return (
    <div
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        display: "flex",
        mt: "10%",
        gap: 10,
      }}
    >
      <h1 style={{ gap: 1, display: "flex" }}>
        Aradığınız sayfa bulunamadı veya bu sayfayı görmeye yetkiniz yok.{"\t"}
      </h1>
    </div>
  );
};

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  let userRole;
  useEffect(() => {
    const checkAuth = async () => {
      const jwtToken = cookies.get("jwt-access");
      const publicRoutes = ["/register", "/forgot-password", "/login"];

      if (jwtToken) {
        try {
          const decodedToken = jwtDecode(jwtToken);
          const userRole = decodedToken.role;
          const userId = decodedToken.sub;

          // Initialize WebSocket connection for authenticated users
          if (!websocketService.isConnected()) {
            console.log('🔌 Initializing WebSocket connection for user:', userId);
            websocketService.connect(jwtToken, userId);
          }

          // If on login page with valid token, redirect to home
          if (publicRoutes.includes(location.pathname)) {
            navigate("/homepage");
            setIsLoading(false);
            return;
          }

          if (userRole === "admin" && !location.pathname.startsWith("/admin")) {
            // Admin can access both admin and user routes
          } else if (
            userRole === "user" &&
            location.pathname.startsWith("/admin")
          ) {
            navigate("/NotFound");
          }
        } catch (error) {
          console.error("Invalid token:", error);
          cookies.remove("jwt-access");
          cookies.remove("jwt-refresh");
          websocketService.disconnect(); // Disconnect WebSocket on auth error
          navigate("/login");
        }
      } else {
        // No token - redirect to login unless on public route
        websocketService.disconnect(); // Disconnect WebSocket when not authenticated
        if (!publicRoutes.includes(location.pathname)) {
          navigate("/login");
        }
      }
      setIsLoading(false);
    };

    checkAuth();

    // Cleanup on unmount
    return () => {
      // Don't disconnect on every route change, only on unmount
    };
  }, [navigate, location.pathname]);

  if (isLoading) {
    return <div>...</div>; // veya bir yükleme spinner'ı
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<MainLayout />}>
        <Route
          index
          element={
            window.location.hostname ===
            process.env.REACT_APP_LANDING_PAGE_DOMAIN ? (
              <LandingPage />
            ) : (
              <Navigate to="/homepage" replace />
            )
          }
        />
        <Route path="homepage" element={<HomePage />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="user/profile" element={<ProfilePage />} />
        <Route path="user/security" element={<TwoFactorAuthPage />} />
        <Route path="databases" element={<DatabaseList />} />
        <Route path="cloud-storage" element={<CloudStorageList />} />
        <Route path="backup-jobs" element={<BackupJobsList />} />
        <Route path="backup-history" element={<BackupHistoryList />} />
        <Route path="notifications" element={<EmailNotificationSettings />} />
        <Route path="user/gridPage" element={<GridPage />} />
        <Route path="user/components" element={<ComponentsPage />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminPage />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
