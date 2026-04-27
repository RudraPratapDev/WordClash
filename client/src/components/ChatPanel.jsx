import { memo, useState, useRef, useEffect } from 'react';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import { Send, X } from 'lucide-react';

function ChatPanel({ onCloseMobile }) {
  const chat = useGameStore((state) => state.chat);
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
      <div className="module-head chat-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Room Chat</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="ghost-btn" onClick={() => setAutoScroll(prev => !prev)}>
            Auto-scroll: {autoScroll ? 'On' : 'Off'}
          </button>
          {onCloseMobile && (
            <button type="button" className="mobile-close-btn ghost-btn" onClick={onCloseMobile}>
              <X size={14} /> Close
            </button>
          )}
        </div>
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

export default memo(ChatPanel);
