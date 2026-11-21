const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
module.exports = async ({ appOutDir, packager }) => {
  await flipFuses(path.join(appOutDir, `${packager.appInfo.productFilename}.exe`), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  });
};
