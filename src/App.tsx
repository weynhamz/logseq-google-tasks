import React from "react";
import { useState, useEffect } from "react";

import "virtual:uno.css";
import { handleSync } from "./gTasks";

interface GoogleTasksSyncProgressProps {
  syncMessage: string;
  syncProgress: number;
  syncComplete: boolean;
}

const GoogleTasksSyncProgress: React.FC<GoogleTasksSyncProgressProps> = ({ syncProgress, syncMessage, syncComplete }) => {
  return (
    <div>
      <div className="w-full h-4 bg-gray-200 rounded-full mt-4">
        <div className={`h-4 rounded-full ${syncComplete ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${syncProgress}%` }}></div>
      </div>
      <div className="text-center mt-2">
        {syncComplete ? (
          <div className="text-green-600">Sync Complete!</div>
        ) : (
          <div className="flex justify-between">
            <div className="text-blue-600">{syncMessage}</div>
            <div className="text-blue-600">{Math.round(syncProgress)}%</div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncComplete, setSyncComplete] = useState(false);

  useEffect(() => {
    if (syncProgress >= 100) {
      setSyncComplete(true);
    }
  }, [syncProgress]);

  return (
    <main className="flex w-screen h-screen items-center justify-center absolute top-0 left-0 right-0 bottom-0 bg-gray-500 opacity-90">
      <div id="innerDiv" className="rounded-lg shadow-lg relative text-center text-xl p-4 border bg-gray-100 border-gray-300 w-3/4 h-auto">
        <div>Logseq Google Tasks</div>
        {(isSyncing || syncComplete) ? (
          <GoogleTasksSyncProgress syncProgress={syncProgress} syncMessage={syncMessage} syncComplete={syncComplete} />
        ) : null}
        {!isSyncing ? (
          <div className="text-center mt-4">
          <button
            className="bg-blue-500 text-white rounded-full px-4 py-2 mt-4 mr-4"
            onClick={() => {
              logseq.showSettingsUI();
            }}
          >
            Open Plugin Settings
          </button>
          <button
            className="bg-blue-500 text-white rounded-full px-4 py-2 mt-4"
            onClick={() => {
              setSyncComplete(false);
              handleSync(setSyncProgress, setSyncMessage, setIsSyncing);
            }}
          >
            Sync Google Tasks
          </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default App;
