import { Toaster } from "sonner";

import { useTheme } from "../../contexts/ThemeContext";

export default function ToastHost() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "12px",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: "13.5px"
        }
      }}
    />
  );
}
