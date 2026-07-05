import type { Href, Router } from "expo-router";

export const MAIN_ROUTES = {
  home: "/",
  search: "/search",
  live: "/live",
  favorites: "/favorites",
  settings: "/settings",
} as const;

export type MainRoute = (typeof MAIN_ROUTES)[keyof typeof MAIN_ROUTES];

export const navigateToMainRoute = (router: Router, route: MainRoute) => {
  router.replace(route as Href);
};
