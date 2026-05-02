export const ROWS = 8;
export const COLS = 10;
export const CARD_TYPES = 18;       // 16 캐릭터 + 2 아이템
export const CARDS_PER_TYPE = 4;
export const TIME_LIMIT = 100;      // 초기 시간 1분40초 = 100초
export const TIME_CLEAR_BONUS = 60; // 판 클리어 시 +60초 추가
export const SCORE_PER_MATCH = 10;
export const TIME_BONUS_MULTIPLIER = 10;
export const TIME_ADD_SECONDS = 5;
export const BOARD_CLEAR_BONUS = 100; // 판 클리어 보너스
export const MAX_TURNS = 2;

export const ITEM_TIME_ID = 16;
export const ITEM_SHUFFLE_ID = 17;
export const OBSTACLE_ID = -1;  // 부셔지지 않는 장애물 타일

export interface CardDef {
  id: number;
  name: string;
  color: string;      // 카드 배경색 (캐릭터 고유 컬러)
  textColor: string;  // 어두운/밝은 텍스트 자동 대응
  image: string;      // public 폴더 기준 경로
  isItem: boolean;
  itemEffect?: 'time' | 'shuffle';
}

export const CARD_DEFS: CardDef[] = [
  // id  name        color      textColor  image
  { id: 0,  name: '감자가비', color: '#9CEE7A', textColor: '#1a4000', image: '/chars/감자가비.svg', isItem: false },
  { id: 1,  name: '견자희',   color: '#DEFFFE', textColor: '#003333', image: '/chars/견자희.svg',   isItem: false },
  { id: 2,  name: '고래',     color: '#87D4EA', textColor: '#003355', image: '/chars/고래.svg',     isItem: false }, // 미지정 → 바다색
  { id: 3,  name: '김마렌',   color: '#51D1FF', textColor: '#003355', image: '/chars/김마렌.svg',   isItem: false },
  { id: 4,  name: '멜로딩딩', color: '#E4ABFF', textColor: '#3d0066', image: '/chars/멜로딩딩.svg', isItem: false },
  { id: 5,  name: '밀크티냠', color: '#FDCECE', textColor: '#5a0000', image: '/chars/밀크티냠.svg', isItem: false },
  { id: 6,  name: '빡쏘',     color: '#B37777', textColor: '#ffffff', image: '/chars/빡쏘.svg',     isItem: false },
  { id: 7,  name: '삐요코',   color: '#F8F0D7', textColor: '#3a2a00', image: '/chars/삐요코.svg',   isItem: false },
  { id: 8,  name: '새우',     color: '#FFB8A0', textColor: '#5a1a00', image: '/chars/새우.svg',     isItem: false }, // 미지정 → 연어색
  { id: 9,  name: '쏭이',     color: '#96B1FF', textColor: '#001166', image: '/chars/쏭이.svg',     isItem: false },
  { id: 10, name: '온자두',   color: '#FF868F', textColor: '#5a0010', image: '/chars/온자두.svg',   isItem: false },
  { id: 11, name: '울큰고',   color: '#5D5D5D', textColor: '#ffffff', image: '/chars/울큰고.svg',   isItem: false },
  { id: 12, name: '이지수',   color: '#A882B6', textColor: '#ffffff', image: '/chars/이지수.svg',   isItem: false },
  { id: 13, name: '조아라',   color: '#FF8058', textColor: '#ffffff', image: '/chars/조아라.svg',   isItem: false },
  { id: 14, name: '채하나',   color: '#FEF4F5', textColor: '#3a1a1a', image: '/chars/채하나.svg',   isItem: false },
  { id: 15, name: '희희덕',   color: '#FFEC65', textColor: '#3a3300', image: '/chars/희희덕.svg',   isItem: false },
  { id: 16, name: '시간추가', color: '#222222', textColor: '#ffffff', image: '/item/time.svg',      isItem: true, itemEffect: 'time'    },
  { id: 17, name: '셔플',     color: '#222222', textColor: '#ffffff', image: '/item/shuffle.svg',   isItem: true, itemEffect: 'shuffle' },
];
