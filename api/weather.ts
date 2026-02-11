// api/weather.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { convertToGrid } from '../utils/kmaGrid';

const API_KEY = process.env.KMA_API_KEY; 
const API_ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

// 날씨 코드 변환 헬퍼
const getPtyStatus = (ptyCode: string) => {
    switch (ptyCode) {
        case '1': return '비';
        case '2': return '비/눈';
        case '3': return '눈';
        case '4': return '소나기';
        default: return null;
    }
};

const getSkyStatus = (skyCode: string) => {
    switch (skyCode) {
        case '1': return '맑음';
        case '3': return '구름많음';
        case '4': return '흐림';
        default: return '';
    }
};

// 특정 지점 날씨 조회 함수
async function fetchPointWeather(lat: number, lng: number, targetDateTime: Date) {
    const { x, y } = convertToGrid(lat, lng);
    
    // Base Time 계산 (가장 가까운 발표 시각 찾기: 02, 05, 08...)
    const now = new Date();
    const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
    
    // API 제공 지연(10분) 안전 마진 고려 (15분 전 기준)
    const safeTime = new Date(kstNow.getTime() - 15 * 60000);
    const safeHour = safeTime.getUTCHours();
    
    let baseTimeHour = 23;
    let baseDateStr = kstNow.toISOString().slice(0, 10).replace(/-/g, '');

    for (let i = baseTimes.length - 1; i >= 0; i--) {
        if (baseTimes[i] <= safeHour) {
            baseTimeHour = baseTimes[i];
            break;
        }
    }
    
    // 자정 직후 처리
    if (safeHour < 2) {
        const yesterday = new Date(safeTime);
        yesterday.setDate(yesterday.getDate() - 1);
        baseDateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
        baseTimeHour = 23;
    }

    const baseTimeStr = baseTimeHour.toString().padStart(2, '0') + "00";
    
    // 타겟 시간 포맷 (HH00) - 기상청 예보는 정시 단위
    const targetHourStr = targetDateTime.getHours().toString().padStart(2, '0') + "00";
    const targetDateStr = targetDateTime.toISOString().slice(0, 10).replace(/-/g, '');

    const url = `${API_ENDPOINT}?serviceKey=${API_KEY}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDateStr}&base_time=${baseTimeStr}&nx=${x}&ny=${y}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.response?.header?.resultCode !== '00') return null;

        const items = data.response.body.items.item;
        const result = { tmp: '', sky: '', pty: '', pcp: '' };

        items.forEach((item: any) => {
            if (item.fcstDate === targetDateStr && item.fcstTime === targetHourStr) {
                if (item.category === 'TMP') result.tmp = item.fcstValue;
                if (item.category === 'SKY') result.sky = item.fcstValue;
                if (item.category === 'PTY') result.pty = item.fcstValue;
                if (item.category === 'PCP') result.pcp = item.fcstValue;
            }
        });

        if (!result.tmp && !result.sky) return null;

        return result;
    } catch (e) {
        console.error("KMA API Request Fail:", e);
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { points } = req.body; 

    if (!points || !Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ error: 'Points data required' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: KMA_API_KEY missing" });
    }

    try {
        const weatherPromises = points.map(p => 
            fetchPointWeather(p.lat, p.lng, new Date(p.time))
        );
        
        const results = await Promise.all(weatherPromises);
        
        const midW = results[1]; // 중간 지점
        const endW = results[results.length - 1]; // 도착지

        let briefing = "";
        let isWarning = false;
        let details = endW;

        // 1. 이동 중 악천후 체크 (중간 지점)
        if (midW && midW.pty !== '0' && midW.pty !== '') {
            const rainType = getPtyStatus(midW.pty);
            briefing = `가는 길에 ${rainType} 소식(${midW.pcp})이 있습니다. 안전운전하세요.`;
            isWarning = true;
        } 
        // 2. 도착지 악천후 체크
        else if (endW && endW.pty !== '0' && endW.pty !== '') {
            const rainType = getPtyStatus(endW.pty);
            briefing = `도착지에 ${rainType} 예보가 있습니다. (${endW.pcp})`;
            isWarning = true;
        }
        // 3. 특이사항 없음 -> 심플 도착지 브리핑
        else if (endW) {
            const sky = getSkyStatus(endW.sky);
            briefing = `도착 시 ${sky}, 기온 ${endW.tmp}℃ 예상됩니다.`;
        } else {
            briefing = "기상 정보를 불러올 수 없습니다. (예보 구간 초과 등)";
        }

        res.status(200).json({ 
            briefing, 
            isWarning,
            details
        });

    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: 'Weather fetch failed', briefing: "" });
    }
}