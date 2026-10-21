import { HashRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import Shell from "./components/Shell";
import { ToastProvider } from "./components/ui/Toast";
import { DataVersionProvider } from "./context/DataVersionContext";
import Evaluation from "./screens/Evaluation";
import Group from "./screens/Group";
import Home from "./screens/Home";
import Settings from "./screens/Settings";

export default function App() {
  return (
    <ToastProvider>
      <DataVersionProvider>
        <HashRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="grupo/:id" element={<Group />} />
              <Route path="evaluacion/:id" element={<Evaluation />} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="*" element={<p className="text-muted">Pagina no encontrada.</p>} />
            </Route>
          </Routes>
        </HashRouter>
      </DataVersionProvider>
    </ToastProvider>
  );
}
