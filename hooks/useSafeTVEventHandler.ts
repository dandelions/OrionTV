import { useEffect } from "react";
import type { HWEvent } from "react-native";
import * as ReactNative from "react-native";

type TVEventHandlerModule = {
  addListener?: (handler: (event: HWEvent) => void) => { remove?: () => void } | undefined;
};

export const useSafeTVEventHandler = (handler?: (event: HWEvent) => void) => {
  useEffect(() => {
    if (!handler) return;
    if (!ReactNative.Platform.isTV) return;

    const tvEventHandler = (ReactNative as { TVEventHandler?: TVEventHandlerModule }).TVEventHandler;
    const subscription = tvEventHandler?.addListener?.(handler);

    return () => {
      subscription?.remove?.();
    };
  }, [handler]);
};
