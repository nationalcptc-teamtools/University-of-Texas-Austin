import { createKumoToastManager } from "@cloudflare/kumo";

/** The app's one toast manager, so code outside components can raise toasts. */
export const toasts = createKumoToastManager();
