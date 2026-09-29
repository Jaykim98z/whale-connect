export const ROWS = 8;
export const COLS = 10;
export const CARD_TYPES = 28;       // 15 멤버 + 11 팬캐릭 + 2 아이템
export const CARDS_PER_TYPE = 4;
export const TIME_LIMIT = 100;      // 초기 시간 1분40초 = 100초
export const SCORE_PER_MATCH = 10;
export const TIME_BONUS_MULTIPLIER = 10;
export const TIME_ADD_SECONDS = 5;
export const BOARD_CLEAR_BONUS = 100;
export const MAX_TURNS = 2;

// ── 콤보 시스템 ──
export const COMBO_WINDOW_MS = 3000; // 직전 매칭 후 3초 안에 매칭하면 콤보 +1
export const COMBO_POINT     = 2;    // 콤보 1당 추가 점수
export const COMBO_MAX        = 5;   // 최대 콤보

// ── 스테이지 진입 시 추가 시간 ──
// 전 라운드 공통 +60초
export function stageTimeBonus(_enteringStage: number): number {
  return 60;
}

export const ITEM_TIME_ID    = 26;
export const ITEM_SHUFFLE_ID = 27;
export const OBSTACLE_ID     = -1;

// 스테이지별 등장 팬캐릭 수
export const FANCHAR_COUNT_EARLY = 3;  // S1–S2
export const FANCHAR_COUNT_LATE  = 4;  // S3+

export interface CardDef {
  id: number;
  name: string;
  color: string;      // 카드 배경색
  textColor: string;  // 텍스트 색상
  image?: string;     // public 폴더 기준 경로 (아이템 카드는 lucide 아이콘을 사용하므로 없음)
  isItem: boolean;
  isFanchar: boolean; // true = 팬캐릭 (스테이지마다 랜덤 선발)
  itemEffect?: 'time' | 'shuffle';
}

export const CARD_DEFS: CardDef[] = [
  // ── Members (id 0–14): 항상 등장 ──────────────────────────────────────────
  { id:  0, name: '감자가비', color: '#9CEE7A', textColor: '#1a4000', image: '/chars/members/감자가비.png', isItem: false, isFanchar: false },
  { id:  1, name: '견자희',   color: '#87D4EA', textColor: '#003355', image: '/chars/members/견자희.png',   isItem: false, isFanchar: false },
  { id:  2, name: '김마렌',   color: '#51D1FF', textColor: '#003355', image: '/chars/members/김마렌.png',   isItem: false, isFanchar: false },
  { id:  3, name: '멜로딩딩', color: '#E4ABFF', textColor: '#3d0066', image: '/chars/members/멜로딩딩.png', isItem: false, isFanchar: false },
  { id:  4, name: '밀크티냠', color: '#FDCECE', textColor: '#5a0000', image: '/chars/members/밀크티냠.png', isItem: false, isFanchar: false },
  { id:  5, name: '빡소',     color: '#B37777', textColor: '#ffffff', image: '/chars/members/빡소.png',     isItem: false, isFanchar: false },
  { id:  6, name: '삐요코',   color: '#F8F0D7', textColor: '#3a2a00', image: '/chars/members/삐요코.png',   isItem: false, isFanchar: false },
  { id:  7, name: '쏭이',     color: '#96B1FF', textColor: '#001166', image: '/chars/members/쏭이.png',     isItem: false, isFanchar: false },
  { id:  8, name: '울큰고',   color: '#5D5D5D', textColor: '#ffffff', image: '/chars/members/울큰고.png',   isItem: false, isFanchar: false },
  { id:  9, name: '이지수',   color: '#A882B6', textColor: '#ffffff', image: '/chars/members/이지수.png',   isItem: false, isFanchar: false },
  { id: 10, name: '조아라',   color: '#FF8058', textColor: '#ffffff', image: '/chars/members/조아라.png',   isItem: false, isFanchar: false },
  { id: 11, name: '채하나',   color: '#FEF4F5', textColor: '#3a1a1a', image: '/chars/members/채하나.png',   isItem: false, isFanchar: false },
  { id: 12, name: '희희덕',   color: '#FFEC65', textColor: '#3a3300', image: '/chars/members/희희덕.png',   isItem: false, isFanchar: false },
  { id: 13, name: '묵아',     color: '#EBB380', textColor: '#5a2e00', image: '/chars/members/묵아.png',     isItem: false, isFanchar: false },
  { id: 14, name: '셀키',     color: '#C6D2DC', textColor: '#233444', image: '/chars/members/셀키.png',     isItem: false, isFanchar: false },
  // ── Fanchars (id 15–25): 스테이지마다 랜덤 선발 ──────────────────────────
  { id: 15, name: '고래',     color: '#C5E8FB', textColor: '#003355', image: '/chars/fanchars/고래.png',    isItem: false, isFanchar: true },
  { id: 16, name: '새우',     color: '#FFB8A0', textColor: '#5a1a00', image: '/chars/fanchars/새우.png',    isItem: false, isFanchar: true },
  { id: 17, name: '올챙구',   color: '#F0AC97', textColor: '#5a2a10', image: '/chars/fanchars/올챙구.png',  isItem: false, isFanchar: true },
  { id: 18, name: '쭈꾸미',   color: '#C24CAF', textColor: '#ffffff', image: '/chars/fanchars/쭈꾸미.png',  isItem: false, isFanchar: true },
  { id: 19, name: '쑤벌',     color: '#B8A4E8', textColor: '#1a0055', image: '/chars/fanchars/쑤벌.png',    isItem: false, isFanchar: true },
  { id: 20, name: '아부',     color: '#FF5252', textColor: '#ffffff', image: '/chars/fanchars/아부.png',    isItem: false, isFanchar: true },
  { id: 21, name: '티백이',   color: '#FFB3C8', textColor: '#6b0024', image: '/chars/fanchars/티백이.png',  isItem: false, isFanchar: true },
  { id: 22, name: '빡릴라',   color: '#C47A3A', textColor: '#ffffff', image: '/chars/fanchars/빡릴라.png',  isItem: false, isFanchar: true },
  { id: 23, name: '잎새',     color: '#3C6073', textColor: '#ffffff', image: '/chars/fanchars/잎새.png',    isItem: false, isFanchar: true },
  { id: 24, name: '다시마',   color: '#9FE0C8', textColor: '#0a3d33', image: '/chars/fanchars/다시마.png',  isItem: false, isFanchar: true },
  { id: 25, name: '스윗가비단', color: '#F0D9A8', textColor: '#5a3d00', image: '/chars/fanchars/스윗가비단.png', isItem: false, isFanchar: true },
  // ── Items (id 26–27) ──────────────────────────────────────────────────────
  { id: 26, name: '시간추가', color: '#222222', textColor: '#ffffff', isItem: true,  isFanchar: false, itemEffect: 'time'    },
  { id: 27, name: '셔플',     color: '#222222', textColor: '#ffffff', isItem: true,  isFanchar: false, itemEffect: 'shuffle' },
];
