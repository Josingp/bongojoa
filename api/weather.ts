import type { VercelRequest, VercelResponse } from '@vercel/node';

// ==========================================
// [1. 좌표 변환 로직 (통합됨)]
// ==========================================

interface GridCoord { x: number; y: number; }

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0;      // 격자 간격(km)
const SLAT1 = 30.0;    // 투영 위도1(degree)
const SLAT2 = 60.0;    // 투영 위도2(degree)
const OLON = 126.0;    // 기준점 경도(degree)
const OLAT = 38.0;     // 기준점 위도(degree)
const XO = 43;         // 기준점 X좌표(GRID)
const YO = 136;        // 기준점 Y좌표(GRID)

const convertToGrid = (lat: number, lng: number): GridCoord => {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { x, y };
};

// ==========================================
// [2. 서버리스 API 핸들러 (안전장치 추가)]
// ==========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS 설정
    res.setHeader('Access-Control-Allow-Credentials', "true");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. 환경변수 확인
    const API_KEY = process.env.KMA_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: "Server Key Error", briefing: "서버 설정 오류" });
    }

    // 🌟 핵심 수정: req.body가 없어도 뻗지 않도록 안전장치(|| {}) 추가
    const { points } = req.body || {}; 

    if (!points || !Array.isArray(points)) {
        // 데이터 없이 들어오면 400 에러를 내고 얌전히 종료 (Crash 방지)
        return res.status(400).json({ error: 'Points data required' });
    }

    // 3. 기상청 API 호출 함수
    async function fetchWeather(lat: number, lng: number, targetDateObj: Date) {
        try {
            const { x, y } = convertToGrid(lat, lng);
            
            // KST 시간 변환
            const kstTime = new Date(targetDateObj.getTime() + (9 * 60 * 60 * 1000));
            const year = kstTime.getUTCFullYear();
            const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(kstTime.getUTCDate()).padStart(2, '0');
            const hours = kstTime.getUTCHours();
            
            // Base Time 계산 (20분 전 기준)
            const safeTime = new Date(kstTime.getTime() - 20 * 60000); 
            const safeHour = safeTime.getUTCHours();
            
            const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
            let baseTimeHour = 23;
            let baseDateStr = year + month + day;

            if (hours < 2) {
                const yesterday = new Date(kstTime);
                yesterday.setDate(yesterday.getDate() - 1);
                baseDateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
                baseTimeHour = 23;
            } else {
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

            const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
                        `?serviceKey=${encodeURIComponent(API_KEY)}` + 
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
            console.error("Fetch Fail:", e);
            return null;
        }
    }

    // 4. 실행 및 결과 조합
    try {
        const results = await Promise.all(points.map((p: any) => 
            fetchWeather(p.lat, p.lng, new Date(p.time))
        ));

        const midW = results[1];
        const endW = results[results.length - 1];

        let briefing = "";
        let isWarning = false;
        let details = endW;

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

        res.status(200).json({ briefing, isWarning, details });

    } catch (error: any) {
        res.status(500).json({ error: error.message, briefing: "날씨 정보를 가져올 수 없습니다." });
    }
}