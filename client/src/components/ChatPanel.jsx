import { useState, useRef, useEffect } from 'react';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import { Send } from 'lucide-react';

export default function ChatPanel() {
  const { chat } = useGameStore();
  const [text, setText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    if (!autoScroll) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, autoScroll]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('chat_message', { text });
    setText('');
  };

  return (
    <div className="panel module chat-panel">
      <div className="module-head chat-head">
        <span>Room Chat</span>
        <button type="button" className="ghost-btn" onClick={() => setAutoScroll(prev => !prev)}>
          Auto-scroll: {autoScroll ? 'On' : 'Off'}
        </button>
      </div>
      <div className="module-body chat-scroll">
        {chat.map(msg => (
          <div key={msg.id} className="chat-bubble">
            <span className="chat-name">{msg.sender}</span>
            <p>{msg.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} className="module-foot row">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          className="input"
          placeholder="Type message..."
        />
        <button type="submit" className="btn"><Send size={16} /></button>
      </form>
    </div>
  );
}
