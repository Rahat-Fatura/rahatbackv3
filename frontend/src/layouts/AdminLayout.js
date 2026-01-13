import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../components/adminSideBar/adminSideBar"; // Admin'e özel bir sidebar yapabilirsin
import localStorage from "local-storage";
import { Grid, Box } from "@mui/material";
import Navbar from "../components/navbar/navbar";

const AdminLayout = () => {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const sideBarOpen = localStorage.get("admin_sidebar");

    if (sideBarOpen === "false") {
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }

    const cleanupLocalStorage = () => {
      localStorage.remove("admin_sidebar"); // Sadece admin sidebar için temizlik
    };
    window.addEventListener("beforeunload", cleanupLocalStorage);
    return () => {
      window.removeEventListener("beforeunload", cleanupLocalStorage);
    };
  }, []);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
    localStorage.set("sidebar", !isOpen); // admin için kaydediyoruz
  };

  return (
    <Box sx={{ position: "relative", display: "flex", width: "100%" }}>
      <Box
        sx={{
          width: { xs: "70px", sm: isOpen ? "275px" : "95px" },
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 3,
          transition: "width 0.3s ease",
        }}
      >
        <AdminSidebar status={isOpen} toggleSidebar={toggleSidebar} />
      </Box>

      <Box
        sx={{
          marginLeft: { xs: "90px", sm: isOpen ? "275px" : "95px" },
          width: {
            xs: "calc(100% - 70px)",
            sm: isOpen ? "calc(100% - 275px)" : "calc(100% - 95px)",
          },
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end", // İçeriği sağa yaslar
          transition: "margin-left 0.3s ease, width 0.3s ease",
        }}
      >
        <Box
          sx={{
            width: { xs: "96.8%", md: "100%" },
            paddingRight: { xs: "10px", sm: "20px" },
          }}
        >
          <Navbar />
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default AdminLayout;
