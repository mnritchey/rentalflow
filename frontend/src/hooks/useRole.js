import { useAuth } from '../context/AuthContext';

export function useRole() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return {
    isAdmin,
    isOperator: !isAdmin,
    can: {
      accessSettings:     isAdmin,
      accessImportExport: isAdmin,
      accessActivityLog:  isAdmin,
      deleteEquipment:    isAdmin,
      deleteProjects:     isAdmin,
      deleteContacts:     isAdmin,
      assignAnyTask:      isAdmin,
      deleteTask:         isAdmin,
      viewAllTasks:       isAdmin,
    },
  };
}
