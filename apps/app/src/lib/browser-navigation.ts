export function getBrowserLocationHref() {
  return window.location.href;
}

export function getBrowserLocationPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function navigateBrowserTo(url: string) {
  window.location.assign(url);
}
