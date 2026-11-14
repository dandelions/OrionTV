const { withDangerousMod, withXcodeProject, withInfoPlist } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# @generated begin react-native-tvos-pod-deployment-target";
const POST_INSTALL_ANCHOR = /^\s*post_install do \|installer\|\s*$/;
const POD_SNIPPET = `    ${MARKER}
    # Xcode 26+ rejects deployment targets below the SDK minimum, so lift every Pod to the app target.
    pod_deployment_target = podfile_properties['ios.deploymentTarget']
    if pod_deployment_target
      installer.pods_project.targets.each do |pod_target|
        pod_target.build_configurations.each do |build_config|
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = pod_deployment_target
          build_config.build_settings['TVOS_DEPLOYMENT_TARGET'] = pod_deployment_target
        end
      end
    end
    # @generated end react-native-tvos-pod-deployment-target`;

// CocoaPods reports each Pod's own deployment target, so the app target setting alone is not enough.
const withPodDeploymentTarget = (config) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(MARKER)) {
        return config;
      }

      const lines = contents.split("\n");
      const anchorIndex = lines.findIndex((line) => POST_INSTALL_ANCHOR.test(line));

      if (anchorIndex === -1) {
        throw new Error("withTVBuildSettings: post_install hook not found in Podfile");
      }

      lines.splice(anchorIndex + 1, 0, POD_SNIPPET);
      fs.writeFileSync(podfilePath, lines.join("\n"));

      return config;
    },
  ]);

// Xcode 15+ sandboxes run scripts, which blocks the Expo configure script from reading Pods.
const withUserScriptSandboxingDisabled = (config) =>
  withXcodeProject(config, (config) => {
    const configurations = config.modResults.pbxXCBuildConfigurationSection();

    for (const buildSettings of Object.values(configurations)) {
      if (buildSettings?.buildSettings) {
        buildSettings.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
      }
    }

    return config;
  });

// tvOS 18+ SDK requires UIScene lifecycle for applications built with this SDK
const withSceneLifecycle = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "AppDelegate",
          },
        ],
      },
    };
    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;

      // Patch AppDelegate.h
      const headerPath = path.join(projectRoot, projectName, "AppDelegate.h");
      if (fs.existsSync(headerPath)) {
        let headerContent = fs.readFileSync(headerPath, "utf8");
        if (!headerContent.includes("UIWindowSceneDelegate")) {
          headerContent = headerContent.replace(
            "@interface AppDelegate : EXAppDelegateWrapper",
            "@interface AppDelegate : EXAppDelegateWrapper <UIWindowSceneDelegate>"
          );
          fs.writeFileSync(headerPath, headerContent);
        }
      }

      // Patch AppDelegate.mm
      const mmPath = path.join(projectRoot, projectName, "AppDelegate.mm");
      if (fs.existsSync(mmPath)) {
        let mmContent = fs.readFileSync(mmPath, "utf8");
        if (!mmContent.includes("UISceneDelegate")) {
          const sceneSnippet = `
#pragma mark - UISceneDelegate

- (UISceneConfiguration *)application:(UIApplication *)application configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession options:(UISceneConnectionOptions *)options
{
  UISceneConfiguration *sceneConfig = [[UISceneConfiguration alloc] initWithName:@"Default Configuration" sessionRole:connectingSceneSession.role];
  sceneConfig.delegateClass = [AppDelegate class];
  return sceneConfig;
}

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions
{
  if ([scene isKindOfClass:[UIWindowScene class]]) {
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    AppDelegate *appDelegate = (AppDelegate *)[UIApplication sharedApplication].delegate;
    UIWindow *window = appDelegate.window;
    if (window) {
      self.window = window;
      window.windowScene = windowScene;
      window.frame = windowScene.coordinateSpace.bounds;
      [window makeKeyAndVisible];
    }
  }
}
`;
          mmContent = mmContent.replace("@end", `${sceneSnippet}\n@end`);
          fs.writeFileSync(mmPath, mmContent);
        }
      }

      return config;
    },
  ]);

  return config;
};

const withTVBuildSettings = (config) => {
  config = withPodDeploymentTarget(config);
  config = withUserScriptSandboxingDisabled(config);
  config = withSceneLifecycle(config);
  return config;
};

module.exports = withTVBuildSettings;
