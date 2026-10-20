import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FilamentCataloguePage from "./CatalogueEditor";
import { ToastHost } from "./components/ToastHost";
import { ConfirmHost } from "./components/ConfirmHost";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FilamentCataloguePage />
    <ToastHost />
    <ConfirmHost />
  </React.StrictMode>,
);
