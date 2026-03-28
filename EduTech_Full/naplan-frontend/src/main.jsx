import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { AuthProvider } from "./app/context/AuthContext.jsx";
import App from "./app/App.jsx";
import "./styles/index.css";
import "./global.css";

createRoot(document.getElementById("root")).render(
  <HashRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HashRouter>
);
