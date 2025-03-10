import "@logseq/libs";

import settingSchema from "./settings";
import { handleSync } from "./gTasks";

const pluginId = 'logseq-google-tasks';

function main() {
  console.info(`#${pluginId}: ` + "Logseq Google Tasks Plugin Loading!");

  settingSchema();

  logseq.App.registerCommandPalette(
    { key: "sync-google-tasks", label: "Sync Google Tasks", keybinding: { binding: '' } },
    async () => {
      await handleSync();
    }
  );

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
