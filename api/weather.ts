import type { VercelRequest, VercelResponse } from '@vercel/node';
import { convertToGrid } from '../utils/kmaGrid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS 및 Preflight 처리 (필수)
    res.setHeader('Access-Control-Allow-Credentials', "true");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // OPTIONS 요청(Preflight)이면 바로 승인
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const API_KEY = process.env.KMA_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: KMA_API_KEY missing" });
    }

    const { points } = req.body;
    if (!points || !Array.isArray(points)) {
        return res.status(400).json({ error: 'Points data required' });
    }

    // 2. 내부 함수: 단일 지점 날씨 조회
    async function fetchPointWeather(lat: number, lng: number, targetDateTime: Date) {
        try {
            const { x, y } = convertToGrid(lat, lng);
            
            // KST 시간 변환
            const kstTime = new Date(targetDateTime.getTime() + (9 * 60 * 60 * 1000));
            const year = kstTime.getUTCFullYear();
            const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(kstTime.getUTCDate()).padStart(2, '0');
            const hours = kstTime.getUTCHours();

            // Base Time 계산 (기상청 발표 시각: 02, 05, 08, 11, 14, 17, 20, 23)
            // API 데이터 제공 지연(약 10~15분)을 고려해 20분 전 시간을 기준으로 계산
            const safeTime = new Date(kstTime.getTime() - 20 * 60000);
            const safeHour = safeTime.getUTCHours();
            
            const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
            let baseTimeHour = 23;
            let baseDateStr = year + month + day;

            // 새벽 0~2시 사이라면 전날 23시 데이터 사용
            if (hours < 2) {
                const yesterday = new Date(kstTime);
                yesterday.setDate(yesterday.getDate() - 1);
                baseDateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
                baseTimeHour = 23;
            } else {
                // 현재 시간보다 이전의 가장 가까운 발표 시각 찾기
                for (let i = baseTimes.length - 1; i >= 0; i--) {
                    if (baseTimes[i] <= safeHour) {
                        baseTimeHour = baseTimes[i];
                        break;
                    }
                }
            }

            const baseTimeStr = String(baseTimeHour).padStart(2, '0') + "00";
            const targetHourStr = String(hours).padStart(2, '0') + "00";
            const targetDateStr = year + month + day;

            // URL 조합 (인증키 인코딩 문제 방지를 위해 템플릿 리터럴 사용)
            // 주의: 일반 인증키(Decoding)를 사용한다고 가정합니다.
            const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` + 
                        `?serviceKey=${API_KEY}` +  // 이미 인코딩된 키라면 그대로, 아니면 encodeURIComponent(API_KEY)
                        `&pageNo=1&numOfRows=1000&dataType=JSON` + 
                        `&base_date=${baseDateStr}&base_time=${baseTimeStr}&nx=${x}&ny=${y}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.response?.header?.resultCode !== '00') return null;

            const items = data.response.body.items.item;
            const result = { tmp: '', sky: '', pty: '', pcp: '' };
            let found = false;

            items.forEach((item: any) => {
                if (item.fcstDate === targetDateStr && item.fcstTime === targetHourStr) {
                    if (item.category === 'TMP') result.tmp = item.fcstValue;
                    if (item.category === 'SKY') result.sky = item.fcstValue;
                    if (item.category === 'PTY') result.pty = item.fcstValue;
                    if (item.category === 'PCP') result.pcp = item.fcstValue;
                    found = true;
                }
            });

            return found ? result : null;

        } catch (e) {
            console.error("API Call Failed", e);
            return null;
        }
    }

    try {
        const results = await Promise.all(points.map((p: any) => 
            fetchPointWeather(p.lat, p.lng, new Date(p.time))
        ));

        const midW = results[1];
        const endW = results[results.length - 1];

        let briefing = "";
        let isWarning = false;

        const getPty = (code: string) => {
            if(code === '1') return '비';
            if(code === '2') return '비/눈';
            if(code === '3') return '눈';
            if(code === '4') return '소나기';
            return '';
        };

        const getSky = (code: string) => {
            if(code === '1') return '맑음';
            if(code === '3') return '구름많음';
            if(code === '4') return '흐림';
            return '';
        }

        if (midW && midW.pty && midW.pty !== '0') {
            briefing = `이동 중 ${getPty(midW.pty)} 소식(${midW.pcp})이 있습니다. 빗길 안전운전하세요.`;
            isWarning = true;
        } else if (endW && endW.pty && endW.pty !== '0') {
            briefing = `도착지에 ${getPty(endW.pty)} 예보가 있습니다. (${endW.pcp})`;
            isWarning = true;
        } else if (endW && endW.sky) {
            briefing = `도착 시 ${getSky(endW.sky)}, 기온 ${endW.tmp}℃ 예상됩니다.`;
        } else {
            briefing = "기상청 데이터 수신 대기 중...";
        }

        res.status(200).json({ briefing, isWarning });

    } catch (error: any) {
        res.status(500).json({ error: error.message, briefing: "날씨 정보를 가져올 수 없습니다." });
    }
}