import { useCallback, useEffect, useRef } from "react";
import { Alert, AppState, BackHandler, Platform } from "react-native";
import * as ReactNative from "react-native";
import { usePathname, useRouter } from "expo-router";
import { MAIN_ROUTES, navigateToMainRoute } from "@/utils/navigation";

const EXIT_REENABLE_DELAY_MS = 8000;

type TVEventControlModule = {
  enableTVMenuKey?: () => void;
  disableTVMenuKey?: () => void;
};

type ExitAppModule = {
  exitApp?: () => void;
};

const getTVEventControl = () =>
  (ReactNative as { TVEventControl?: TVEventControlModule }).TVEventControl;

const getExitAppModule = () =>
  ReactNative.NativeModules?.OrionExitApp as ExitAppModule | undefined;

export const useTVBackNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const isExitAlertVisibleRef = useRef(false);
  const reenableTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const clearReenableTimer = useCallback(() => {
    if (reenableTimerRef.current) {
      clearTimeout(reenableTimerRef.current);
      reenableTimerRef.current = null;
    }
  }, []);

  const enableTVMenuKey = useCallback(() => {
    clearReenableTimer();
    getTVEventControl()?.enableTVMenuKey?.();
  }, [clearReenableTimer]);

  const temporarilyAllowSystemMenuExit = useCallback(() => {
    getTVEventControl()?.disableTVMenuKey?.();
    clearReenableTimer();
    reenableTimerRef.current = setTimeout(() => {
      getTVEventControl()?.enableTVMenuKey?.();
      reenableTimerRef.current = null;
    }, EXIT_REENABLE_DELAY_MS);
  }, [clearReenableTimer]);

  const exitApp = useCallback(() => {
    const nativeExitApp = getExitAppModule()?.exitApp;
    if (nativeExitApp) {
      nativeExitApp();
      return;
    }

    temporarilyAllowSystemMenuExit();
    BackHandler.exitApp();
  }, [temporarilyAllowSystemMenuExit]);

  const showExitConfirmation = useCallback(() => {
    if (isExitAlertVisibleRef.current) {
      return true;
    }

    isExitAlertVisibleRef.current = true;
    Alert.alert(
      "退出 OrionTV",
      "确定要退出应用吗？",
      [
        {
          text: "取消",
          style: "cancel",
          onPress: () => {
            isExitAlertVisibleRef.current = false;
            enableTVMenuKey();
          },
        },
        {
          text: "退出",
          style: "destructive",
          onPress: () => {
            isExitAlertVisibleRef.current = false;
            exitApp();
          },
        },
      ]
    );

    return true;
  }, [enableTVMenuKey, exitApp]);

  useEffect(() => {
    if (!Platform.isTV) return;

    enableTVMenuKey();

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pathnameRef.current !== MAIN_ROUTES.home) {
        navigateToMainRoute(router, MAIN_ROUTES.home);
        return true;
      }

      return showExitConfirmation();
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        enableTVMenuKey();
      }
    });

    return () => {
      clearReenableTimer();
      backHandler.remove();
      appStateSubscription.remove();
    };
  }, [clearReenableTimer, enableTVMenuKey, router, showExitConfirmation]);
};
