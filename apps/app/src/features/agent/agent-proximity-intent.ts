const NEAR_ME_PATTERN =
  /\bnear\s+me\b|\bnearest\s+(?:to\s+)?me\b|\bclosest\s+to\s+me\b/iu;
const CLOSEST_WORK_PATTERN =
  /\b(?:closest|nearest)\b(?=.*\b(?:job|jobs|site|sites)\b)|\b(?:job|jobs|site|sites)\b(?=.*\b(?:closest|nearest)\b)/iu;
const NEARBY_WORK_PATTERN =
  /\bnearby\b(?=.*\b(?:job|jobs|site|sites)\b)|\b(?:job|jobs|site|sites)\b(?=.*\bnearby\b)/iu;
const ROUTE_WORK_PATTERN =
  /\b(?:route|directions?|drive|driving|how\s+close)\b(?=.*\b(?:job|jobs|site|sites)\b)/iu;
const ROUTE_DESTINATION_PATTERN =
  /\b(?:directions?|route|drive|driving)\s+(?:to|towards)\s+[\p{L}\p{N}]/iu;
const GET_TO_DESTINATION_PATTERN =
  /\b(?:how\s+(?:do|can)\s+i\s+get\s+to|get\s+me\s+to)\s+[\p{L}\p{N}]/iu;

const TYPED_ORIGIN_PATTERN =
  /\b(?:from|near|around|close\s+to|starting\s+at)\s+(?!me\b|my\b|here\b)[\p{L}\p{N}]/iu;

export function shouldAttachCurrentLocationToAgentMessage(text: string) {
  const normalized = text.trim();

  if (normalized.length === 0) {
    return false;
  }

  if (NEAR_ME_PATTERN.test(normalized)) {
    return true;
  }

  if (TYPED_ORIGIN_PATTERN.test(normalized)) {
    return false;
  }

  return (
    CLOSEST_WORK_PATTERN.test(normalized) ||
    NEARBY_WORK_PATTERN.test(normalized) ||
    ROUTE_WORK_PATTERN.test(normalized) ||
    ROUTE_DESTINATION_PATTERN.test(normalized) ||
    GET_TO_DESTINATION_PATTERN.test(normalized)
  );
}
