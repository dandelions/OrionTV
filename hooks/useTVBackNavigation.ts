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

const getTVEventControl = () =>
  (ReactNative as { TVEventControl?: TVEventControlModule }).TVEventControl;

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

  const showExitConfirmation = useCallback(() => {
    if (isExitAlertVisibleRef.current) {
      return true;
    }

    isExitAlertVisibleRef.current = true;
    Alert.alert(
      "退出 OrionTV",
      "确定要退出应用吗？选择退出后，请再按一次返回键退出到 Apple TV 主屏幕。",
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
            temporarilyAllowSystemMenuExit();
          },
        },
      ]
    );

    return true;
  }, [enableTVMenuKey, temporarilyAllowSystemMenuExit]);

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
