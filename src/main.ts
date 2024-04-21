import "@logseq/libs";

function main() {
  console.info("Logseq Google Tasks Plugin Loading!");

  logseq.App.registerCommandPalette(
    { key: "sync-google-tasks", label: "Sync Google Tasks" },
    async () => {
      logseq.UI.showMsg("Sync Google Tasks");
    }
  );
}

logseq.ready(main).catch(console.error);
