import React from "react";
import "virtual:uno.css";

function App() {
  return (
    <main className="flex w-screen h-screen items-center justify-center absolute top-0 left-0 right-0 bottom-0 bg-gray-500 opacity-90">
      <div id="innerDiv" className="rounded-lg shadow-lg relative text-center text-xl p-4 border bg-gray-100 border-gray-300 w-3/4 h-auto">
        <div>Logseq Google Tasks</div>
      </div>
    </main>
  );
}

export default App;
