import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("jananiai-user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(localStorage.getItem("jananiai-token") || null);

  useEffect(() => {
    if (token) {
      localStorage.setItem("jananiai-token", token);
    } else {
      localStorage.removeItem("jananiai-token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("jananiai-user", JSON.stringify(user));
    } else {
      localStorage.removeItem("jananiai-user");
    }
  }, [user]);

  const login = (userData, authToken) => {
    setToken(authToken);
    setUser(userData);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
