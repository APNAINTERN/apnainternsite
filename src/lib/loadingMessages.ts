export const LOADING_MESSAGES = {
  default: "Loading...",
  pleaseWait: "Please wait...",
  fetching: "Fetching data...",
  processing: "Processing your request...",
  uploading: "Uploading file...",
  saving: "Saving changes...",
  verifying: "Verifying information...",
  generating: "Generating report...",
  creatingAccount: "Creating account...",
  payment: "Completing payment...",
  finalizing: "Finalizing...",
  almostDone: "Almost done...",
  signingIn: "Signing you in...",
  registering: "Completing registration...",
  generatingIdCard: "Generating ID card...",
  generatingCertificate: "Generating certificate...",
  importing: "Importing data...",
  exporting: "Exporting data...",
  loadingDashboard: "Loading dashboard...",
  loadingPermissions: "Loading permissions...",
} as const;

export type LoadingMessageKey = keyof typeof LOADING_MESSAGES;

export function loadingMessage(
  key: LoadingMessageKey | string = "default"
): string {
  if (key in LOADING_MESSAGES) {
    return LOADING_MESSAGES[key as LoadingMessageKey];
  }
  return key;
}
