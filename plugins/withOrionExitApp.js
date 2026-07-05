const { withDangerousMod, withInfoPlist, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_FILE = "OrionExitApp.m";
const MODULE_SOURCE = `#import <React/RCTBridgeModule.h>
#import <stdlib.h>

@interface OrionExitApp : NSObject <RCTBridgeModule>
@end

@implementation OrionExitApp

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(exitApp)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    exit(0);
  });
}

@end
`;

const IOS_ONLY_INFO_PLIST_KEYS = [
  "CADisableMinimumFrameDurationOnPhone",
  "LSRequiresIPhoneOS",
  "UIRequiresFullScreen",
  "UIStatusBarStyle",
  "UISupportedInterfaceOrientations",
  "UISupportedInterfaceOrientations~ipad",
  "UIViewControllerBasedStatusBarAppearance",
];

const withOrionExitApp = (config) => {
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;
      const modulePath = path.join(projectRoot, projectName, MODULE_FILE);

      fs.mkdirSync(path.dirname(modulePath), { recursive: true });
      fs.writeFileSync(modulePath, MODULE_SOURCE);

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    const sourcePath = path.join(projectName, MODULE_FILE);

    if (!project.hasFile(sourcePath)) {
      const target = project.getFirstTarget().uuid;
      const group = project.findPBXGroupKey({ name: projectName });
      project.addSourceFile(sourcePath, { target }, group);
    }

    return config;
  });

  config = withInfoPlist(config, (config) => {
    for (const key of IOS_ONLY_INFO_PLIST_KEYS) {
      delete config.modResults[key];
    }
    return config;
  });

  return config;
};

module.exports = withOrionExitApp;
