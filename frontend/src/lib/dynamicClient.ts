import { createDynamicClient, initializeClient } from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";

let clientInstance: any = null;

export function getDynamicClient() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!clientInstance) {
    try {
      clientInstance = createDynamicClient({
        autoInitialize: false,
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID || "56723438-864e-4a04-a970-e168c8cee6b5",
        metadata: {
          universalLink: window.location.origin,
        },
      });

      addEvmExtension();
      initializeClient().catch((err) => {
        console.warn("Dynamic API network fetch notice (handling fallback gracefully):", err);
      });
    } catch (e) {
      console.warn("Dynamic client creation warning:", e);
    }
  }

  return clientInstance;
}

export const dynamicClient = typeof window !== "undefined" ? getDynamicClient() : null;
