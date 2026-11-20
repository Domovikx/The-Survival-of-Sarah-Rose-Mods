import { createRoot } from "react-dom/client";

import { App } from "./App";
import { installMockBackend } from "./mock";
import "./tokens.css";

// В браузере (npm run dev) вызовов Tauri нет — подменяем только транспорт,
// чтобы интерфейс можно было смотреть локально. В окне Tauri не используется.
const inTauri = "__TAURI_INTERNALS__" in window;
if (!inTauri && !location.search.includes("mock=0")) installMockBackend();

createRoot(document.getElementById("root")!).render(<App />);
