import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { loginUser, registerUser, clearApiCache } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => JSON.parse(localStorage.getItem('cv_user')  || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('cv_token') || '');

  const persist = (token, user) => {
    localStorage.setItem('cv_token', token);
    localStorage.setItem('cv_user',  JSON.stringify(user));
    setToken(token);
    setUser(user);
  };

  const login = useCallback(async (email, password) => {
    const data = await loginUser({ email, password });
    persist(data.token, data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await registerUser({ name, email, password });
    persist(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    clearApiCache(); // never show one account's cached data to the next
    localStorage.removeItem('cv_token');
    localStorage.removeItem('cv_user');
    setToken(''); setUser(null);
  }, []);

  const updateUser = useCallback((newToken, newUser) => {
    persist(newToken, newUser);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, register, logout, updateUser }),
    [user, token, login, register, logout, updateUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
