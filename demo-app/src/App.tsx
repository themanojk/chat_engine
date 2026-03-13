import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { fetchDemoConfig, fetchDemoToken } from "./lib/socketChatClient";

function App() {
  const serverUrl = useMemo(() => import.meta.env.VITE_API_URL ?? "http://localhost:4000", []);
  const [userId, setUserId] = useState("user-a");
  const [tenantId, setTenantId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [storageType, setStorageType] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [error, setError] = useState("");

  const refreshAuthToken = useCallback(async (): Promise<string> => {
    if (!userId) {
      throw new Error("No active user selected");
    }
    const token = await fetchDemoToken(serverUrl, userId);
    setAuthToken(token);
    return token;
  }, [serverUrl, userId]);

  useEffect(() => {
    let isMounted = true;

    void fetchDemoConfig(serverUrl)
      .then((config) => {
        if (!isMounted) {
          return;
        }
        setTenantId(config.tenantId);
        setConversationId(config.conversationId);
        setUsers(config.users);
        setStorageType(config.storageType);
        if (config.users.length > 0) {
          setUserId(config.users[0]);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [serverUrl]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isMounted = true;
    setAuthToken("");

    void refreshAuthToken()
      .then((token) => {
        if (isMounted) {
          setAuthToken(token);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshAuthToken]);

  if (error) {
    return (
      <main className="page">
        <h1>Chat Engine Demo App</h1>
        <p className="error">Unable to connect to demo server: {error}</p>
      </main>
    );
  }

  if (!tenantId || !conversationId) {
    return (
      <main className="page">
        <h1>Chat Engine Demo App</h1>
        <p className="muted">Loading demo configuration...</p>
      </main>
    );
  }

  if (!authToken) {
    return (
      <main className="page">
        <h1>Chat Engine Demo App</h1>
        <p className="muted">Loading user token...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Chat Engine Demo App</h1>
      <p className="meta">
        Server: <strong>{serverUrl}</strong> | Storage: <strong>{storageType}</strong>
      </p>

      <div className="toolbar">
        <label htmlFor="userId">Active user</label>
        <select
          id="userId"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        >
          {users.map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </select>
      </div>

      <ChatWindow
        userId={userId}
        tenantId={tenantId}
        conversationId={conversationId}
        serverUrl={serverUrl}
        authToken={authToken}
        onAuthExpired={refreshAuthToken}
      />
    </main>
  );
}

export default App;
