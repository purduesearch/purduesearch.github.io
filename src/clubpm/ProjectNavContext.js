import { createContext, useContext, useState, useCallback } from 'react';

const ProjectNavContext = createContext(null);

export function ProjectNavProvider({ children }) {
  const [projectNav, setProjectNavState] = useState(null);
  const setProjectNav = useCallback((nav) => setProjectNavState(nav), []);
  const clearProjectNav = useCallback(() => setProjectNavState(null), []);

  return (
    <ProjectNavContext.Provider value={{ projectNav, setProjectNav, clearProjectNav }}>
      {children}
    </ProjectNavContext.Provider>
  );
}

export function useProjectNav() {
  return useContext(ProjectNavContext);
}
