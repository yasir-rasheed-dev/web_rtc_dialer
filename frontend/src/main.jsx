import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import CallWindow from "./pages/call-window/CallWindow";
import ModalHost from "./components/ui/ModalHost";
import ToastHost from "./components/ui/ToastHost";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./global.css";
import "./styles.css";
import "./console.css";

// The Electron desktop app's call popup loads this exact same bundle, just
// at "#call-window" instead of the normal root — see electron/main.js's
// createCallWindow(). On the web this hash never appears, so RootView
// always renders <App/> there.
const isCallWindow = window.location.hash.startsWith("#call-window");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      {isCallWindow ? <CallWindow /> : <App />}
      <ModalHost />
      <ToastHost />
    </ThemeProvider>
  </React.StrictMode>
);
