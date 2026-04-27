export interface SoopUserInfo {
  soopId: string;
  nickname: string;
  profileImage: string | null;
  isValid: boolean;
}

export async function fetchSoopUser(soopId: string): Promise<SoopUserInfo> {
  const id = soopId.trim();
  if (!id) return { soopId: id, nickname: '', profileImage: null, isValid: false };

  try {
    const res = await fetch(`https://bjapi.afreecatv.com/api/${id}/station`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return { soopId: id, nickname: '', profileImage: null, isValid: false };

    const data = await res.json();
    const nick: string = data.user_nick || data.station?.user_nick || '';
    if (!nick) return { soopId: id, nickname: '', profileImage: null, isValid: false };

    let profileImage: string | null = null;
    const raw: string = data.profile_image || data.station?.profile_image || '';
    if (raw) {
      profileImage = raw.startsWith('//') ? `https:${raw}` : raw.startsWith('http') ? raw : null;
    }

    return { soopId: id, nickname: nick, profileImage, isValid: true };
  } catch {
    return { soopId: id, nickname: '', profileImage: null, isValid: false };
  }
}
