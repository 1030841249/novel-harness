import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useSyncExternalStore } from "react";

const NAVIGATION_EVENT = "novel-harness:navigate";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAVIGATION_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAVIGATION_EVENT, callback);
  };
}

function snapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function scrollToHash(hash: string, attempts = 0) {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (attempts < 12) window.setTimeout(() => scrollToHash(hash, attempts + 1), 50);
}

export function navigate(to: string, options?: { replace?: boolean }) {
  if (options?.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  if (window.location.hash) scrollToHash(window.location.hash);
  else window.scrollTo({ top: 0, behavior: "auto" });
}

export function useLocation() {
  useSyncExternalStore(subscribe, snapshot, () => "/");
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }
  return <a {...props} href={to} onClick={handleClick} />;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  useEffect(() => navigate(to, { replace }), [to, replace]);
  return null;
}

export function useNavigate() {
  return navigate;
}

export function useParams(): { project?: string } {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/(?:projects|editor)\/([^/]+)$/);
  if (!match) return {};
  try {
    return { project: decodeURIComponent(match[1]) };
  } catch {
    return {};
  }
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>, options?: { replace?: boolean }) => void] {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const setParams = (next: URLSearchParams | Record<string, string>, options?: { replace?: boolean }) => {
    const query = next instanceof URLSearchParams ? next : new URLSearchParams(next);
    navigate(`${location.pathname}${query.size ? `?${query}` : ""}`, options);
  };
  return [params, setParams];
}
