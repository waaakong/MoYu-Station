const desktopPackage = require("./package.json");
const { updateSigningConfig } = require('./scripts/update-signing-config.cjs');
const updateSettings = updateSigningConfig();
if (updateSettings.mode === 'manifest-signed') process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

const allowedChannels = new Set(["stable", "beta", "provider-experimental"]);
const channel = allowedChannels.has(process.env.STUDYROOM_UPDATE_CHANNEL)
  ? process.env.STUDYROOM_UPDATE_CHANNEL
  : "stable";
const appIds = {
  stable: "xyz.moyustation.studyroom",
  beta: "xyz.moyustation.studyroom.beta",
  "provider-experimental": "xyz.moyustation.studyroom.provider-experimental"
};
const productNames = {
  stable: "墨屿自习室 · MoYu Station",
  beta: "墨屿自习室 Beta",
  "provider-experimental": "墨屿自习室 Provider Experimental"
};
const releaseVersion = process.env.STUDYROOM_RELEASE_VERSION || desktopPackage.version;

if (channel === "provider-experimental" && !["1", "true", "yes", "on"].includes(String(process.env.STUDYROOM_EXPERIMENTAL_PROVIDERS || "").toLowerCase())) {
  throw new Error("provider-experimental packages require STUDYROOM_EXPERIMENTAL_PROVIDERS=1");
}

module.exports = {
  ...desktopPackage.build,
  appId: appIds[channel],
  productName: productNames[channel],
  extraMetadata: { version: releaseVersion },
  ...(updateSettings.signing ? {
    forceCodeSigning: true,
    win: {
      ...desktopPackage.build.win,
      verifyUpdateCodeSignature: true,
      signtoolOptions: {
        publisherName: updateSettings.signing.publisher,
        ...(updateSettings.signing.certificateStore ? { certificateSha1: updateSettings.signing.thumbprint } : {}),
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: updateSettings.signing.timestampUrl
      }
    }
  } : updateSettings.mode === 'manifest-signed' ? {
    forceCodeSigning: false,
    win: { ...desktopPackage.build.win, verifyUpdateCodeSignature: false }
  } : {}),
  artifactName: `MoYu-Setup-${channel === 'stable' ? '' : channel + '-'}\${version}-win-\${arch}.\${ext}`,
  directories: { ...desktopPackage.build.directories, output: `release/${channel}` },
  publish: [{
    provider: "generic",
    channel: 'latest',
    url: `${updateSettings.updateOrigin}/private-updates/releases/${channel}/${releaseVersion}/`
  }]
};
