import { render } from "solid-js/web";
import { App } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html.");

render(() => <App />, root);
