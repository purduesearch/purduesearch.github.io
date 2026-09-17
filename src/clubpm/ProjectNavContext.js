import { createContext, useContext, useState, useCallback } from 'react';

const ProjectNavContext = createContext(null);

export function ProjectNavProvider({ children }) {
  const [projectNav, setProjectNavState] = useState(null);
  // AppShell owns the one project collection used by the desktop rail and
  // phone picker. Home consumes this same collection instead of fetching and
  // storing a second copy.
  const [projects, setProjects] = useState([]);
  const [projectsLoad, setProjectsLoad] = useState({ status: 'loading', message: '' });
  const setProjectNav = useCallback((nav) => setProjectNavState(nav), []);
  const clearProjectNav = useCallback(() => setProjectNavState(null), []);

  return (
    <ProjectNavContext.Provider value={{
      projectNav,
      setProjectNav,
      clearProjectNav,
      projects,
      setProjects,
      projectsLoad,
      setProjectsLoad,
    }}>
      {children}
    </ProjectNavContext.Provider>
  );
}

export function useProjectNav() {
  return useContext(ProjectNavContext);
}
