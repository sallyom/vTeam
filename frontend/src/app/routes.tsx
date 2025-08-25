import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFound } from '@app/NotFound/NotFound';

import ProjectManager from '../components/ProjectManager';
import ProjectDetails from '../components/ProjectDetails';

import SimpleFeatureSizing from '../components/SimpleFeatureSizing';
import SessionManager from '../components/SessionManager';

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  /* eslint-disable @typescript-eslint/no-explicit-any */
  element: React.ReactElement;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  exact?: boolean;
  path: string;
  title: string;
  routes?: undefined;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;

const routes: AppRouteConfig[] = [
  {
    element: <SimpleFeatureSizing />,
    exact: true,
    label: 'Feature Sizing',
    path: '/',
    title: 'RHOAI Feature Sizing',
  },
  {
    element: <ProjectManager />,
    exact: true,
    label: 'Knowledge Base',
    path: '/projects',
    title: 'RHOAI Feature Sizing | Knowledge Base',
  },
  {
    element: <ProjectDetails />,
    exact: true,
    path: '/projects/:projectId',
    title: 'RHOAI Feature Sizing | Project Details',
  },
  {
    element: <SessionManager />,
    exact: true,
    label: 'Sessions',
    path: '/sessions',
    title: 'RHOAI Feature Sizing | Sessions',
  },
];

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[],
);

const AppRoutes = (): React.ReactElement => (
  <Routes>
    {flattenedRoutes.map(({ path, element }, idx) => (
      <Route path={path} element={element} key={idx} />
    ))}
    <Route element={<NotFound />} />
  </Routes>
);

export { AppRoutes, routes };
