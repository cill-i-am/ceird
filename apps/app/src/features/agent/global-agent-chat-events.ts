export const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

export function requestOpenGlobalAgentChat() {
  window.dispatchEvent(new CustomEvent(GLOBAL_AGENT_CHAT_OPEN_EVENT));
}
