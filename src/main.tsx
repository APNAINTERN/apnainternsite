import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ReactGA from "react-ga4";
import * as Sentry from "@sentry/react";

ReactGA.initialize("G-8RN6D7SN2S");

Sentry.init({
  dsn: "https://d7148027f82f26685b643f515b610919@o4511488465829888.ingest.us.sentry.io/4511488494141440",
  sendDefaultPii: true
});

createRoot(document.getElementById("root")!).render(<App />);
