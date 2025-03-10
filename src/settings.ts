import "@logseq/libs";

export default function settingSchema() {
  logseq.useSettingsSchema([
    {
      key: "client_id",
      type: "string",
      title: "Client ID",
      description: "",
      default: "",
    },
    {
      key: "client_secret",
      type: "string",
      title: "Client Secret",
      description: "",
      default: "",
    },
    {
      key: "access_token",
      type: "string",
      title: "Access Token",
      description: "",
      default: "",
    },
    {
      key: "refresh_token",
      type: "string",
      title: "Refresh Token",
      description: "",
      default: "",
    },
  ]);
}
