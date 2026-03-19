import { notarize } from "@electron/notarize";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const hasAppleIdCredentials = () =>
  Boolean(
    process.env.APPLE_ID?.trim() &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim() &&
      process.env.APPLE_TEAM_ID?.trim()
  );

const hasApiKeyCredentials = () =>
  Boolean(
    process.env.APPLE_API_KEY?.trim() &&
      process.env.APPLE_API_KEY_ID?.trim() &&
      process.env.APPLE_API_ISSUER?.trim()
  );

export default async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  if (!hasAppleIdCredentials() && !hasApiKeyCredentials()) {
    console.log("Skipping notarization: Apple notarization credentials are not configured.");
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);

  const options = hasApiKeyCredentials()
    ? {
        appPath,
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER
      }
    : {
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      };

  console.log(`Notarizing ${appPath}`);
  await notarize(options);
  console.log(`Notarization completed for ${appPath}`);
}
