import "@logseq/libs";

export default function settingSchema() {
  logseq.useSettingsSchema([
    {
      key: "access_token",
      type: "string",
      title: "Access Token",
      description: "Google Tasks Access Token",
      default: "",
    },
  ]);
}