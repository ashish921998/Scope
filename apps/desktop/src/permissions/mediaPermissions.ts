import { systemPreferences } from "electron";
import type { MediaPermissionState, MediaPermissionStatus } from "@scope/types";

const normalizePermission = (value: string): MediaPermissionState => {
  switch (value) {
    case "granted":
      return "granted";
    case "denied":
      return "denied";
    case "restricted":
      return "restricted";
    case "unknown":
    case "not-determined":
      return "not-determined";
    default:
      return "unsupported";
  }
};

const getAccessStatus = (kind: "microphone" | "screen"): MediaPermissionState => {
  if (process.platform !== "darwin") {
    return "unsupported";
  }

  try {
    return normalizePermission(systemPreferences.getMediaAccessStatus(kind));
  } catch {
    return "unsupported";
  }
};

export const getMediaPermissionStatus = (): MediaPermissionStatus => ({
  microphone: getAccessStatus("microphone"),
  screen: getAccessStatus("screen")
});
