import { FormEvent, useEffect, useMemo, useState } from "react";
import { Message, SocketChatClient } from "../lib/socketChatClient";

type Props = {
  userId: string;
  tenantId: string;
  conversationId: string;
  serverUrl: string;
  authToken: string;
  onAuthExpired: () => Promise<string>;
};

export function ChatWindow({
  userId,
  tenantId,
  conversationId,
  serverUrl,
  authToken,
  onAuthExpired,
}: Props) {
  const client = useMemo(() => new SocketChatClient(serverUrl), [serverUrl]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUser, setTypingUser] = useState<string>("");
  const [text, setText] = useState("");

  useEffect(() => {
    client.connect(authToken, onAuthExpired);
    void client.joinConversation(conversationId);

    client
      .listMessages({
        conversationId,
      })
      .then(setMessages);

    const unsubscribeMessage = client.onMessageReceived((event) => {
      if (
        event.tenantId === tenantId &&
        event.conversationId === conversationId
      ) {
        setMessages((prev) => [...prev, event.message]);
      }
    });

    const unsubscribeTyping = client.onTypingStarted((event) => {
      if (event.tenantId === tenantId && event.conversationId === conversationId) {
        setTypingUser(event.userId);
        setTimeout(() => setTypingUser(""), 1200);
      }
    });

    return () => {
      void client.leaveConversation(conversationId);
      unsubscribeMessage();
      unsubscribeTyping();
      client.disconnect();
    };
  }, [client, userId, tenantId, conversationId, authToken, onAuthExpired]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (!content) {
      return;
    }
    await client.sendMessage({
      conversationId,
      content,
    });
    setText("");
  };

  const handleTyping = async (value: string) => {
    setText(value);
    if (value.length > 0) {
      await client.startTyping(conversationId);
    }
  };

  return (
    <section className="chat-card">
      <header className="chat-header">
        <h2>Chat Demo</h2>
        <p>
          Tenant: <strong>{tenantId}</strong> | Conversation:{" "}
          <strong>{conversationId}</strong>
        </p>
      </header>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <p className="muted">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={message.senderId === userId ? "bubble self" : "bubble"}
            >
              <small>{message.senderId}</small>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      <div className="typing">{typingUser ? `${typingUser} is typing...` : ""}</div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(event) => void handleTyping(event.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
