// proposal §1.5 + §5.5
// UA 检测:iPadOS 13+ 用 desktop UA 但有 touch,需兜底
const UA_RE = /Mobi|Android|iPhone|iPad|iPod/i;

export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (UA_RE.test(navigator.userAgent)) return true;
  // iPadOS 13+: UA 写 Mac,但 navigator.maxTouchPoints > 0
  if (
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}
