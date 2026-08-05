import { lazy, Suspense } from "react";
import { LoadingState } from "./components/Common";
import { Navigate, useLocation } from "./router";

const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const ProjectsLibrary = lazy(() => import("./pages/ProjectsLibrary").then((module) => ({ default: module.ProjectsLibrary })));
const ProjectWorkspace = lazy(() => import("./pages/ProjectWorkspace").then((module) => ({ default: module.ProjectWorkspace })));
const Editor = lazy(() => import("./pages/Editor").then((module) => ({ default: module.Editor })));

export default function App() {
  const location = useLocation();
  let page = <Navigate to="/" replace />;
  if (location.pathname === "/") page = <Dashboard />;
  else if (location.pathname === "/projects") page = <ProjectsLibrary />;
  else if (/^\/projects\/[^/]+$/.test(location.pathname)) page = <ProjectWorkspace />;
  else if (/^\/editor\/[^/]+$/.test(location.pathname)) page = <Editor />;

  return (
    <Suspense fallback={<div className="route-loading"><LoadingState label="正在打开工作区" /></div>}>
      {page}
    </Suspense>
  );
}
