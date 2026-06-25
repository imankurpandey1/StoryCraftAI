import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "./styles.css";

import { AuthProvider } from "./context/AuthContext.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster position="top-right" toastOptions={{ style: { background: "#10231d", color: "#f8fafc", border: "1px solid rgba(16,185,129,.25)" } }} />
    </AuthProvider>
  </React.StrictMode>
);
