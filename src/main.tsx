import "@logseq/libs";

import settingSchema from "./settings";
import { handleSync } from "./gTasks";

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "virtual:uno.css";

// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args);

const pluginId = 'logseq-google-tasks';

function main() {
  console.info(`#${pluginId}: ` + "Logseq Google Tasks Plugin Loading!");

  settingSchema();

  const node = ReactDOM.createRoot(document.getElementById("app")!);
  node.render(<App />);

  logseq.provideModel(function() {
    return {
      async toggle() {
        logseq.toggleMainUI();
      },
    };
  }());

  logseq.provideStyle(css`
    .google-tasks-trigger-icon {
      width: 18px;
      height: 18px;
      margin: 0.1em 0.1em 0.1em 0.1em;
      background-size: cover;
      background-image: url('https://www.gstatic.com/images/branding/product/1x/tasks_48dp.png');
    }
  `);

  logseq.App.registerUIItem("toolbar", {
    key: "logseq-google-tasks",
    template: `
    <a data-on-click="toggle">
      <div class="google-tasks-trigger-icon"></div>
    </a>
  `,
  });

  logseq.App.onGoogleAuthTokenReceived((payload) => {
    console.info(`#${pluginId}: ` + "Google Auth Token Received");
    console.debug(payload);

    let refresh_token = payload.refresh_token ?? logseq.settings!.refresh_token;

    logseq.updateSettings({
      access_token: payload.access_token,
      refresh_token: refresh_token,
    });

    logseq.UI.showMsg("Google Auth Tokens Received", "success");
  });
}

logseq.ready(main).catch(console.error);
