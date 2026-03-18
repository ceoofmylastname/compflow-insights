const APP_HOSTNAME = import.meta.env.VITE_APP_HOSTNAME || window.location.host;

export const getAppBaseUrl = () => `https://${APP_HOSTNAME}`;
