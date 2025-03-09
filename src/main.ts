import "@logseq/libs";

import settingSchema from "./settings";
import { syncGoogleTasks } from "./gTasks";

const pluginId = 'logseq-google-tasks';

function main() {
  console.info(`#${pluginId}: ` + "Logseq Google Tasks Plugin Loading!");

  settingSchema();

  logseq.App.registerCommandPalette(
    { key: "sync-google-tasks", label: "Sync Google Tasks", keybinding: { binding: '' } },
    async () => {
      try {
        await syncGoogleTasks();
      } catch (error: any) {
        let httpError = error as HttpError;
        if (httpError.status === 401) {
          console.error(`#${pluginId}: ` + 'Access token expired, please re-authenticate');
          logseq.UI.showMsg("Google Tasks Access token expired, please re-authenticate", 'error');
          logseq.showSettingsUI();
        }
      }
    }
  );
}

logseq.ready(main).catch(console.error);
