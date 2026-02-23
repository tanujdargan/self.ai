import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { AppLayout } from "./layouts/AppLayout";
import { HomePage } from "./pages/HomePage";
import { ChatPage } from "./pages/ChatPage";
import { ImportPage } from "./pages/ImportPage";
import { ModelsPage } from "./pages/ModelsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrainPage } from "./pages/TrainPage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

// Layout route for pages that use the three-column layout
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-layout",
  component: AppLayout,
});

const importRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/import",
  component: ImportPage,
});

const trainRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/train",
  component: TrainPage,
});

const modelsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/models",
  component: ModelsPage,
});

const chatRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/chat/$sessionId",
  component: ChatPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  appLayoutRoute.addChildren([
    importRoute,
    trainRoute,
    modelsRoute,
    chatRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
