import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFound } from '@app/NotFound/NotFound';
import SessionManager from '../components/SessionManager';
import RAGManager from '../components/RAGManager';
import VectorDatabaseDetail from '../components/VectorDatabaseDetail';

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
    element: <SessionManager />,
    exact: true,
    label: 'Dashboard',
    path: '/',
    title: 'JIRA RFE Session Manager | Dashboard',
  },
  {
    element: <SessionManager />,
    exact: true,
    label: 'Session Manager',
    path: '/sessions/:sessionId',
    title: 'JIRA RFE Session Manager | Session',
  },
  {
    element: <RAGManager />,
    exact: true,
    label: 'RAG Manager',
    path: '/rag',
    title: 'JIRA RFE Session Manager | RAG Manager',
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
    <Route path="/rag/db/:id" element={<VectorDatabaseDetail />} />
    <Route element={<NotFound />} />
  </Routes>
);

export { AppRoutes, routes };
