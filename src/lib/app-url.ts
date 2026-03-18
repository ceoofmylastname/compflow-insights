const APP_HOSTNAME = import.meta.env.VITE_APP_HOSTNAME || "baseshophq.com";

export const getAppBaseUrl = () => `https://${APP_HOSTNAME}`;
