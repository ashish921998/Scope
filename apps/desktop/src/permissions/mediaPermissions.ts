import { shell, systemPreferences } from "electron";
import type { MeetingPermissions, MeetingPermissionStatus } from "@scope/types";

const normalizeStatus = (status: string): MeetingPermissionStatus => {
  switch (status) {
    case "granted":
    case "denied":
    case "not-determined":
    case "restricted":
      return status;
    default:
      return "unknown";
  }
};

const readMediaStatus = (kind: "microphone" | "screen") => {
  if (process.platform !== "darwin") {
    return "unknown";
  }

  try {
    return normalizeStatus(systemPreferences.getMediaAccessStatus(kind));
  } catch {
    return "unknown";
  }
};

export const getMeetingPermissions = (): MeetingPermissions => ({
  microphone: readMediaStatus("microphone"),
  screenCapture: readMediaStatus("screen")
});

export const openMeetingPermissionsSettings = async () => {
  if (process.platform !== "darwin") {
    return { ok: false, opened: false };
  }

  const opened = await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  return { ok: true, opened };
};
