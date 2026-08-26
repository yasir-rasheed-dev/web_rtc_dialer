import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ModalHost from "./components/ui/ModalHost";
import ToastHost from "./components/ui/ToastHost";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./global.css";
import "./styles.css";
import "./console.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <ModalHost />
      <ToastHost />
    </ThemeProvider>
  </React.StrictMode>
);
