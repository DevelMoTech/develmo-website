// Decorative CrowdIQ analytics mockups, rendered deterministically (SSR-safe).

function heat(seed: number, n = 72): string[] {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.pow(rnd(), 1.4);
    let c: string;
    if (v < 0.25) c = "rgba(15,178,242,.16)";
    else if (v < 0.5) c = "rgba(15,178,242,.42)";
    else if (v < 0.72) c = "rgba(8,90,140,.6)";
    else if (v < 0.88) c = "rgba(61,242,224,.6)";
    else c = "rgba(61,242,224,.95)";
    out.push(c);
  }
  return out;
}

function HeatGrid({ seed }: { seed: number }) {
  return (
    <div className="heat-grid">
      {heat(seed).map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </div>
  );
}

export function HeroDashboard() {
  return (
    <div className="dash">
      <div className="dash-top">
        <span className="dot a" />
        <span className="dot b" />
        <span className="dot c" />
        &nbsp; CrowdIQ · Aisle Camera 02
        <span className="live">
          <i />
          LIVE
        </span>
      </div>
      <div className="dash-grid">
        <div className="cam">
          <div className="floor" />
          <div className="bbox" style={{ left: "18%", top: "32%", width: "20%", height: "46%" }}>
            <span>#1042 · F · 28</span>
          </div>
          <div className="bbox p" style={{ left: "52%", top: "40%", width: "18%", height: "40%" }}>
            <span>#1043 · M · 35</span>
          </div>
          <div className="bbox bl" style={{ left: "74%", top: "30%", width: "15%", height: "38%" }}>
            <span>#1044 · F · 41</span>
          </div>
        </div>
        <div className="side">
          <div className="kpi-row">
            <div className="kpi-card">
              <b>1,284</b>
              <small>Footfall today</small>
            </div>
            <div className="kpi-card">
              <b>4m 12s</b>
              <small>Avg dwell</small>
            </div>
          </div>
          <div className="chart">
            <div className="lbl">Hourly traffic</div>
            <svg viewBox="0 0 200 60" width="100%" height="56" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hd-ar" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#0FB2F2" stopOpacity="0.5" />
                  <stop offset="1" stopColor="#0FB2F2" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,46 L24,40 L48,42 L72,28 L96,30 L120,16 L144,22 L168,10 L200,18 L200,60 L0,60 Z"
                fill="url(#hd-ar)"
              />
              <path
                d="M0,46 L24,40 L48,42 L72,28 L96,30 L120,16 L144,22 L168,10 L200,18"
                fill="none"
                stroke="#3DF2E0"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>
      <div className="heat">
        <div className="lbl">
          <span>Dwell heatmap · last 6h</span>
          <span>Peak 2-4pm</span>
        </div>
        <HeatGrid seed={11} />
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  return (
    <div className="dash">
      <div className="dash-top">
        <span className="dot a" />
        <span className="dot b" />
        <span className="dot c" />
        &nbsp; CrowdIQ Analytics
        <span className="live">
          <i />
          LIVE
        </span>
      </div>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="kpi-card">
          <b>3,902</b>
          <small>Visitors</small>
        </div>
        <div className="kpi-card">
          <b>62% / 38%</b>
          <small>F / M split</small>
        </div>
        <div className="kpi-card">
          <b>4m 41s</b>
          <small>Avg dwell</small>
        </div>
      </div>
      <div className="chart" style={{ marginTop: "10px" }}>
        <div className="lbl">Footfall vs last week</div>
        <svg viewBox="0 0 220 70" width="100%" height="68" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ad-ar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3DF2E0" stopOpacity="0.45" />
              <stop offset="1" stopColor="#3DF2E0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,54 L31,48 L62,52 L93,34 L124,40 L155,22 L186,30 L220,16 L220,70 L0,70 Z"
            fill="url(#ad-ar)"
          />
          <path
            d="M0,54 L31,48 L62,52 L93,34 L124,40 L155,22 L186,30 L220,16"
            fill="none"
            stroke="#3DF2E0"
            strokeWidth="2"
          />
          <path
            d="M0,60 L31,57 L62,58 L93,50 L124,53 L155,46 L186,49 L220,44"
            fill="none"
            stroke="#3DF2E0"
            strokeWidth="1.6"
            strokeDasharray="4 3"
            opacity="0.85"
          />
        </svg>
      </div>
      <div className="heat">
        <div className="lbl">
          <span>Zone heatmap</span>
          <span>Entrance · Checkout · Aisle 3</span>
        </div>
        <HeatGrid seed={29} />
      </div>
    </div>
  );
}
