// ==UserScript==
// @name         斗鱼网页端极致净化 (Douyu Purify)
// @namespace    https://www.douyu.com/
// @version      1.1.1
// @description  净化斗鱼网页端：保留直播画面、播放器控件与弹幕，彻底清除广告、礼物栏、特效动画(SVGA/VAP)、专题页及后台冗余模块，显著降低CPU/GPU与内存占用。
// @author       jvjjjj
// @license      MIT
// @homepageURL  https://github.com/jvjjjj/douyu-purify
// @supportURL   https://github.com/jvjjjj/douyu-purify/issues
// @downloadURL  https://raw.githubusercontent.com/jvjjjj/douyu-purify/main/douyu-purify.user.js
// @updateURL    https://raw.githubusercontent.com/jvjjjj/douyu-purify/main/douyu-purify.user.js
// @match        https://www.douyu.com/*
// @match        http://www.douyu.com/*
// @exclude      https://www.douyu.com/pages/*
// @exclude      http://www.douyu.com/pages/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const CONFIG_KEY = 'dy_purify_config_v1';

  const DEFAULT_CONFIG = {
    purifyTopic: true,       // 清除专题页上下板块、皮肤背景与推广视频
    hideGiftBar: true,       // 隐藏底部礼物栏并扩展视频画面
    blockEffects: true,      // 屏蔽礼物/入场/连击/SVGA/VAP/Spine特效
    blockAdsPendants: true,  // 屏蔽视频内广告、挂件、悬浮球、PK/竞猜/弹窗
    cleanHeader: true,       // 精简顶部导航栏（保留搜索/关注/历史/登录）
    hideHeader: false,       // 沉浸模式：完全隐藏顶部导航栏
    hideRank: true,          // 隐藏右侧贵宾/钻粉/贡献榜（扩大弹幕列表高度）
    cleanBarrage: true,      // 净化右侧弹幕流（屏蔽进房/送礼/系统推广消息）
    cleanChatTools: true,    // 精简弹幕输入框上方冗余付费图标
    hideWatermark: true,     // 隐藏播放器画面内房间水印
    enableHighlight: false,  // 开启“看点”功能（控制栏X个看点入口、画面实时看点、右侧看点面板）
    wideLayout: true,        // 宽屏无边距（大幅减少左右留白）
    blockIframes: true,      // 拦截任务中心/微信小游戏/私信等后台iframe
    blockNetwork: true,      // 拦截SVGA/VAP特效资源、广告与埋点请求
    capBarrageDom: true,     // 限制右侧弹幕DOM上限(120条)防长时间卡顿
    maxBarrageItems: 120,
    showFloatBtn: true,      // 显示精简净化设置入口按钮
  };

  const stats = {
    blockedRequests: 0,
    killedMedia: 0,
    killedCanvases: 0,
  };

  // ==================== 配置读写与状态同步 ====================
  function loadConfig() {
    let saved = null;
    try {
      if (typeof GM_getValue === 'function') {
        saved = GM_getValue(CONFIG_KEY, null);
      }
      if (!saved && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) saved = JSON.parse(raw);
      }
    } catch (_) {}
    if (typeof saved === 'string') {
      try { saved = JSON.parse(saved); } catch (_) { saved = null; }
    }
    return Object.assign({}, DEFAULT_CONFIG, saved && typeof saved === 'object' ? saved : {});
  }

  function saveConfig(cfg) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(CONFIG_KEY, cfg);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      }
    } catch (_) {}
  }

  let config = loadConfig();

  function isRoomPage() {
    try {
      const p = location.pathname || '/';
      if (/^\/pages\//.test(p)) return false;
      if (/^\/(\d+|topic\/|beta\/)/.test(p)) return true;
      if (/[?&]rid=\d+/.test(location.search || '')) return true;
      if (document.body && document.body.classList.contains('live-next-body')) return true;
      if (document.getElementById('js-player-main') || document.getElementById('js-player-video')) return true;
    } catch (_) {}
    return false;
  }

  function syncHtmlDatasets() {
    const root = document.documentElement;
    if (!root) return;
    const ds = root.dataset;
    ds.dypRoom = isRoomPage() ? '1' : '0';
    ds.dypTopic = config.purifyTopic ? '1' : '0';
    ds.dypGiftbar = config.hideGiftBar ? '1' : '0';
    ds.dypEffects = config.blockEffects ? '1' : '0';
    ds.dypAds = config.blockAdsPendants ? '1' : '0';
    ds.dypCleanheader = config.cleanHeader ? '1' : '0';
    ds.dypHideheader = config.hideHeader ? '1' : '0';
    ds.dypRank = config.hideRank ? '1' : '0';
    ds.dypBarrage = config.cleanBarrage ? '1' : '0';
    ds.dypChattools = config.cleanChatTools ? '1' : '0';
    ds.dypWatermark = config.hideWatermark ? '1' : '0';
    ds.dypHighlight = config.enableHighlight ? '1' : '0';
    ds.dypWide = config.wideLayout ? '1' : '0';
    ds.dypIframes = config.blockIframes ? '1' : '0';
    ds.dypCapbarrage = config.capBarrageDom ? '1' : '0';
  }

  // ==================== 早期注入净化 CSS ====================
  const R = 'html[data-dyp-room="1"]';

  function buildPurifyCSS() {
    return `
/* 1. 专题页与背景皮肤净化 */
${R}[data-dyp-topic="1"] #root > .wm-general,
${R}[data-dyp-topic="1"] .wm-general-bgblur,
${R}[data-dyp-topic="1"] .wm-general-wrapper,
${R}[data-dyp-topic="1"] #bc2,
${R}[data-dyp-topic="1"] #bc2-bgblur,
${R}[data-dyp-topic="1"] #root > .bc-wrapper:not(:has(#js-player-main)),
${R}[data-dyp-topic="1"] .bc-wrapper:not(:has(#js-player-main)),
${R}[data-dyp-topic="1"] #js-super-menu,
${R}[data-dyp-topic="1"] [class*="playerBackgroundBlur__"],
${R}[data-dyp-topic="1"] .layout-Bottom,
${R}[data-dyp-topic="1"] #js-bottom,
${R}[data-dyp-topic="1"] [class*="bottom__"],
${R}[data-dyp-topic="1"] .Bottom,
${R}[data-dyp-topic="1"] #yuba-hot-topic-portal {
  display: none !important;
}
${R}[data-dyp-topic="1"] body.live-next-body #root {
  margin-top: 0 !important;
}
${R}[data-dyp-topic="1"] [class*="playerWrap__"],
${R}[data-dyp-topic="1"] [class*="playerBackground__"] {
  background-image: none !important;
  background-color: transparent !important;
}
${R}[data-dyp-topic="1"] #js-player-main [class*="title__"][class*="info__"] {
  background-image: none !important;
}
${R}[data-dyp-topic="1"] [class*="sidebar__"] {
  --asideTop-background-image: none !important;
  background-image: none !important;
}
${R}[data-dyp-topic="1"] .Header-wrap.NewActNavIng {
  background-image: none !important;
}

/* 2. 隐藏礼物栏并扩展视频区 */
${R}[data-dyp-giftbar="1"] #js-player-main [class*="interactive__"],
${R}[data-dyp-giftbar="1"] #js-player-toolbar,
${R}[data-dyp-giftbar="1"] .PlayerToolbar,
${R}[data-dyp-giftbar="1"] .layout-Player-toolbar,
${R}[data-dyp-giftbar="1"] [class*="interact__"],
${R}[data-dyp-giftbar="1"] [class*="interactiveSkin__"] {
  display: none !important;
}
${R}[data-dyp-giftbar="1"] [class*="stage__"] {
  --stage-interactive-height: 0px !important;
  --stage-player-gap-bottom: 0px !important;
}
${R}[data-dyp-giftbar="1"] .layout-Player-video {
  bottom: 0 !important;
}

/* 3. 屏蔽礼物/SVGA/VAP/Spine/入场特效（保留视频内弹幕层 comment-/danmu-） */
${R}[data-dyp-effects="1"] #js-player-video-widgets .EffectPlayerDom,
${R}[data-dyp-effects="1"] #js-player-video-widgets .DanmuEffectDom,
${R}[data-dyp-effects="1"] #js-player-dialog .ConfigEffect,
${R}[data-dyp-effects="1"] #js-player-dialog .MMSvgaBaseContainer,
${R}[data-dyp-effects="1"] #js-player-dialog .LuckyStarSvgaContainer,
${R}[data-dyp-effects="1"] #js-player-dialog .SuperFansSvgaContainer,
${R}[data-dyp-effects="1"] .layout-Player-effect,
${R}[data-dyp-effects="1"] .GiftEffect-box,
${R}[data-dyp-effects="1"] .GiftSvgaContainer,
${R}[data-dyp-effects="1"] #GiftSvgaPlayer-box,
${R}[data-dyp-effects="1"] .SvgaConfigEffect,
${R}[data-dyp-effects="1"] #ConfigEffectSvgaPlayerAside,
${R}[data-dyp-effects="1"] .DiamondsFansSvgaPlayerDom,
${R}[data-dyp-effects="1"] .AsideEffectPlayerDom,
${R}[data-dyp-effects="1"] #js-spine-player,
${R}[data-dyp-effects="1"] .mp4EffctPlayer,
${R}[data-dyp-effects="1"] #js-svgaV1-player,
${R}[data-dyp-effects="1"] .BarrageBanner,
${R}[data-dyp-effects="1"] #js-aside-gift-barrage-banner,
${R}[data-dyp-effects="1"] .NewGiftBarrageBanner,
${R}[data-dyp-effects="1"] .VideoBarrageBanner,
${R}[data-dyp-effects="1"] .SignBarrage,
${R}[data-dyp-effects="1"] .SysSign-Ad,
${R}[data-dyp-effects="1"] .JS-PlayerEffectWrap,
${R}[data-dyp-effects="1"] .ComboFireworks,
${R}[data-dyp-effects="1"] [class*="animationBox__"],
${R}[data-dyp-effects="1"] .EnterEffect,
${R}[data-dyp-effects="1"] .ChatEffect,
${R}[data-dyp-effects="1"] .ToolbarActivityArea,
${R}[data-dyp-effects="1"] .SuperFansSvga,
${R}[data-dyp-effects="1"] .ScreenBanner {
  display: none !important;
  pointer-events: none !important;
}

/* 4. 屏蔽广告、挂件、悬浮球、PK、竞猜、弹窗（注意保留 #js-player-dialog 容器以兼容扩展工具） */
${R}[data-dyp-ads="1"] #__hyad,
${R}[data-dyp-ads="1"] #js-player-dialog > .player-dialog,
${R}[data-dyp-ads="1"] #js-player-video-above,
${R}[data-dyp-ads="1"] #js-player-guessgame,
${R}[data-dyp-ads="1"] #js-player-pendant,
${R}[data-dyp-ads="1"] #js-player-interactive-panel:not(:has(iframe[src*="ai-live-summary"])):not(:has(.ai-live-summary)),
${R}[data-dyp-ads="1"] #js-player-interactive-panel > :not(:has(iframe[src*="ai-live-summary"])):not(.ai-live-summary),
${R}[data-dyp-ads="1"] #js-layout-fixed-banner,
${R}[data-dyp-ads="1"] #js-layout-fixed-buff,
${R}[data-dyp-ads="1"] #js-layout-fixed-right,
${R}[data-dyp-ads="1"] #js-player-above-controller,
${R}[data-dyp-ads="1"] [class*="case__"] [class*="pk__"],
${R}[data-dyp-ads="1"] #js-player-main [class*="activeContainer__"],
${R}[data-dyp-ads="1"] #js-player-main [class*="ActPendant__"],
${R}[data-dyp-ads="1"] #js-player-asideTopSuspension,
${R}[data-dyp-ads="1"] [class*="sidebar__"] [class*="advert__"],
${R}[data-dyp-ads="1"] [class*="snapbar__"],
${R}[data-dyp-ads="1"] #js-room-activity,
${R}[data-dyp-ads="1"] #js-room-snapbar,
${R}[data-dyp-ads="1"] .ActBase,
${R}[data-dyp-ads="1"] #liveActivityGiftHallEnter202308,
${R}[data-dyp-ads="1"] #giftNamingEnter,
${R}[data-dyp-ads="1"] #actRandomEffectGiftBanner,
${R}[data-dyp-ads="1"] #TestGetAnchorEnter,
${R}[data-dyp-ads="1"] .RechargeBigRewards,
${R}[data-dyp-ads="1"] .DrawContainer,
${R}[data-dyp-ads="1"] .AnchorDrawLottery,
${R}[data-dyp-ads="1"] #AnchorInteractiveTool,
${R}[data-dyp-ads="1"] #new-kill-ie,
${R}[data-dyp-ads="1"] .CPSDialog-container,
${R}[data-dyp-ads="1"] .AnchorUpDialog,
${R}[data-dyp-ads="1"] .AnchorUpTips,
${R}[data-dyp-ads="1"] .FansMedalDialog,
${R}[data-dyp-ads="1"] .layout-Player-asidetop,
${R}[data-dyp-ads="1"] .RoomAd,
${R}[data-dyp-ads="1"] .Bottom-ad,
${R}[data-dyp-ads="1"] .SignBaseComponent-sign-ad,
${R}[data-dyp-ads="1"] .VideoEntry,
${R}[data-dyp-ads="1"] .GuessGameMiniPanelB-wrapper {
  display: none !important;
}

/* 5. 精简 / 隐藏顶部导航栏 */
${R}[data-dyp-cleanheader="1"] #js-header .HeaderNav,
${R}[data-dyp-cleanheader="1"] #js-header .ActEntry,
${R}[data-dyp-cleanheader="1"] #js-header .ScheduleNav,
${R}[data-dyp-cleanheader="1"] #js-header .NextScheduleNavBg,
${R}[data-dyp-cleanheader="1"] #js-header .Header-download-wrap,
${R}[data-dyp-cleanheader="1"] #js-header .Header-broadcast-wrap,
${R}[data-dyp-cleanheader="1"] #js-header .Header-createcenter-wrap,
${R}[data-dyp-cleanheader="1"] #js-header .Header-taskentry-wrap,
${R}[data-dyp-cleanheader="1"] #js-header .Header-yubamessage-wrap,
${R}[data-dyp-cleanheader="1"] #js-header .SupremeRightHeader,
${R}[data-dyp-cleanheader="1"] #js-header .Header-menu-game,
${R}[data-dyp-cleanheader="1"] #js-header .Header-menu-yuba,
${R}[data-dyp-cleanheader="1"] #js-header .Header-menu-video {
  display: none !important;
}
${R}[data-dyp-hideheader="1"] #js-header {
  display: none !important;
}
${R}[data-dyp-hideheader="1"] [class*="stage__"] {
  --state-header-height: 0px !important;
}
${R}[data-dyp-hideheader="1"] [class*="playerWrap__"] {
  --page-header-height: 0px !important;
}

/* 6. 隐藏右侧贵宾/贡献榜，扩大弹幕区（保留第三方 real-audience） */
${R}[data-dyp-rank="1"] .layout-Player-rank,
${R}[data-dyp-rank="1"] .ChatRank,
${R}[data-dyp-rank="1"] .FansRankAll,
${R}[data-dyp-rank="1"] .DiamondsFansRankContainer,
${R}[data-dyp-rank="1"] .layout-Player-rankAll > :not(.real-audience),
${R}[data-dyp-rank="1"] .layout-Player-rankAll:not(:has(.real-audience)) {
  display: none !important;
}

/* 7. 净化右侧弹幕流（保留 .Barrage-toolbar 锁屏/清屏按钮） */
${R}[data-dyp-barrage="1"] #js-floatingbarrage-container,
${R}[data-dyp-barrage="1"] #js-barrage-extend-container,
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem.is-extendBarrage,
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.Barrage-userEnter),
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.Barrage-icon--gift),
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.Barrage-sysMsg),
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.js-barrage-activity-link),
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.Barrage-notice--gift),
${R}[data-dyp-barrage="1"] #js-barrage-list .Barrage-listItem:has(.Barrage-noble) {
  display: none !important;
}
${R}[data-dyp-barrage="1"] #js-barrage-container {
  contain: layout style;
}

/* 8. 精简聊天输入框上方工具栏 */
${R}[data-dyp-chattools="1"] .ChatToolBar .Horn4Category,
${R}[data-dyp-chattools="1"] .ChatToolBar .ChatNobleBarrage,
${R}[data-dyp-chattools="1"] .ChatToolBar .PopularBarrage,
${R}[data-dyp-chattools="1"] .ChatToolBar .EnergyBarrageIcon,
${R}[data-dyp-chattools="1"] .ChatToolBar .followedFansBarrageTip,
${R}[data-dyp-chattools="1"] .ChatToolBar .BarrageWord,
${R}[data-dyp-chattools="1"] .ChatToolBar .ChatBarrageCollect {
  display: none !important;
}

/* 9. 隐藏播放器水印 */
${R}[data-dyp-watermark="1"] #__h5player [class*="watermark-"] {
  display: none !important;
}

/* 10. 宽屏无边距布局（非全屏生效） */
${R}[data-dyp-wide="1"] body:not(.is-fullScreen) [class*="playerWrap__"] {
  --page-gap-horizontal: 16px !important;
  --page-gap-top: 8px !important;
  --page-gap-bottom: 8px !important;
}
${R}[data-dyp-wide="1"] body:not(.is-fullScreen) .layout-Main {
  padding-left: 16px !important;
  padding-right: 16px !important;
}

/* 11. 隐藏后台冗余 iframe */
${R}[data-dyp-iframes="1"] .PrivateLetter,
${R}[data-dyp-iframes="1"] iframe[src*="ord-task-center"],
${R}[data-dyp-iframes="1"] iframe[src*="wxgamesdk"],
${R}[data-dyp-iframes="1"] iframe[src*="game.weixin.qq.com"],
${R}[data-dyp-iframes="1"] iframe.embed-msg {
  display: none !important;
}

/* 12. 看点功能（AI看点）独立开关 */
${R}[data-dyp-highlight="0"] #js-player-controlbar [class*="aiHighlightEntry-"],
${R}[data-dyp-highlight="0"] [class*="ai-highlight-"],
${R}[data-dyp-highlight="0"] .AiLiveSummaryBarrage,
${R}[data-dyp-highlight="0"] .js-ai-live-summary-barrage,
${R}[data-dyp-highlight="0"] .WebViewFrame.ai-live-summary,
${R}[data-dyp-highlight="0"] .WebViewFrame:has(iframe[src*="ai-live-summary"]),
${R}[data-dyp-highlight="0"] #js-player-interactive-panel:has(iframe[src*="ai-live-summary"]),
${R}[data-dyp-highlight="0"] #js-player-interactive-panel .ai-live-summary,
${R}[data-dyp-highlight="0"] iframe[src*="ai-live-summary"] {
  display: none !important;
}

/* 全屏时隐藏悬浮设置按钮 */
body.is-fullScreen #dyp-ui-host,
:fullscreen #dyp-ui-host,
:-webkit-full-screen #dyp-ui-host {
  display: none !important;
}
`;
  }

  function updateBarrageCapCSS() {
    const id = 'dyp-barrage-cap-style';
    let styleEl = document.getElementById(id);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    const maxN = Math.max(30, parseInt(config.maxBarrageItems, 10) || 120);
    styleEl.textContent = `${R}[data-dyp-capbarrage="1"] #js-barrage-list > li:nth-last-child(n+${maxN + 1}) { display: none !important; content-visibility: hidden !important; }`;
  }

  function injectBaseStyles() {
    if (!document.getElementById('dyp-style')) {
      const style = document.createElement('style');
      style.id = 'dyp-style';
      style.textContent = buildPurifyCSS();
      (document.head || document.documentElement).appendChild(style);
    }
    updateBarrageCapCSS();
  }

  syncHtmlDatasets();
  injectBaseStyles();

  // ==================== 网络层精准拦截（保护直播流与核心API） ====================
  const STREAM_ALLOW_RE = /\.(flv|m3u8|ts|m4s|xs|aac|pcm)(\?|$)/i;
  const CORE_API_ALLOW_RE = /\/lapi\/live\/getH5Play|\/betard\/|\/swf_api\/|\/wgapi\/|passport\.douyu\.com|ws-.*\.douyu|danmuproxy/i;

  const TELEMETRY_HOST_RE = /^(dotcounter|dotserver|dotbeats|dotab|dotexperiment|streamdot|vdot|apm)\.douyucdn\.cn$/i;
  const AD_HOST_RE = /^(rtbapi\.douyucdn\.cn|ad\.douyu\.com)$/i;
  const EFFECT_EXT_RE = /\.(svga|vap)(\?|$)/i;
  const GIFT_BROADCAST_RE = /gift\.douyucdn\.cn\/api\/gift\/v2\/web\/broadcast\//i;
  const TOPIC_MP4_RE = /\/dy_asset_pkg\/[^/]+\.mp4(\?|$)/i;
  const HEAVY_IFRAME_RE = /\/pages\/ord-task-center|game\.weixin\.qq\.com\/.*wxgamesdk/i;
  const HIGHLIGHT_PANEL_RE = /\/pages\/ai-live-summary/i;

  function shouldBlockUrl(rawUrl, cfg) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    let parsed;
    try {
      parsed = new URL(rawUrl, location.href);
    } catch (_) {
      return false;
    }
    const href = parsed.href;
    const host = parsed.hostname;
    const pathAndQuery = parsed.pathname + parsed.search;

    // 白名单优先：绝不拦截直播流与房间核心接口
    if (STREAM_ALLOW_RE.test(pathAndQuery) || CORE_API_ALLOW_RE.test(href)) {
      return false;
    }

    if (cfg.blockNetwork) {
      if (TELEMETRY_HOST_RE.test(host)) return true;
      if (AD_HOST_RE.test(host)) return true;
      if (EFFECT_EXT_RE.test(pathAndQuery)) return true;
      if (GIFT_BROADCAST_RE.test(href)) return true;
      if (cfg.purifyTopic && TOPIC_MP4_RE.test(pathAndQuery)) return true;
      if (!cfg.enableHighlight && HIGHLIGHT_PANEL_RE.test(href)) return true;
    }
    if (cfg.blockIframes && HEAVY_IFRAME_RE.test(href)) {
      return true;
    }
    return false;
  }

  function installNetworkHooks() {
    try {
      // 1. navigator.sendBeacon
      if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
        const origBeacon = win.navigator.sendBeacon.bind(win.navigator);
        win.navigator.sendBeacon = function (url, data) {
          if (shouldBlockUrl(String(url || ''), config)) {
            stats.blockedRequests++;
            return true;
          }
          return origBeacon(url, data);
        };
      }

      // 2. fetch
      if (typeof win.fetch === 'function') {
        const origFetch = win.fetch.bind(win);
        win.fetch = function (input, init) {
          try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (shouldBlockUrl(url, config)) {
              stats.blockedRequests++;
              const isBinary = EFFECT_EXT_RE.test(url);
              const body = isBinary ? new ArrayBuffer(0) : '{"error":0,"code":0,"data":{}}';
              const headers = isBinary
                ? { 'Content-Type': 'application/octet-stream' }
                : { 'Content-Type': 'application/json' };
              return Promise.resolve(new win.Response(body, { status: 200, headers }));
            }
          } catch (_) {}
          return origFetch(input, init);
        };
      }

      // 3. XMLHttpRequest
      if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
        const XHRProto = win.XMLHttpRequest.prototype;
        const origOpen = XHRProto.open;
        const origSend = XHRProto.send;
        const BLOCKED_SYM = Symbol('dypBlockedUrl');

        XHRProto.open = function (method, url) {
          try {
            const u = String(url || '');
            this[BLOCKED_SYM] = shouldBlockUrl(u, config) ? u : '';
          } catch (_) {
            this[BLOCKED_SYM] = '';
          }
          return origOpen.apply(this, arguments);
        };

        XHRProto.send = function () {
          const blockedUrl = this[BLOCKED_SYM];
          if (blockedUrl) {
            stats.blockedRequests++;
            const xhr = this;
            const isBinary = EFFECT_EXT_RE.test(blockedUrl);
            const rt = xhr.responseType;
            const fakeResp = rt === 'arraybuffer'
              ? new ArrayBuffer(0)
              : rt === 'json'
                ? { error: 0, code: 0, data: {} }
                : isBinary ? '' : '{"error":0,"code":0,"data":{}}';

            Promise.resolve().then(() => {
              try {
                Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 });
                Object.defineProperty(xhr, 'status', { configurable: true, value: 200 });
                Object.defineProperty(xhr, 'statusText', { configurable: true, value: 'OK' });
                Object.defineProperty(xhr, 'response', { configurable: true, value: fakeResp });
                if (rt === '' || rt === 'text') {
                  Object.defineProperty(xhr, 'responseText', { configurable: true, value: String(fakeResp) });
                }
                if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                xhr.dispatchEvent(new win.Event('readystatechange'));
                if (typeof xhr.onload === 'function') xhr.onload();
                xhr.dispatchEvent(new win.Event('load'));
                if (typeof xhr.onloadend === 'function') xhr.onloadend();
                xhr.dispatchEvent(new win.Event('loadend'));
              } catch (_) {}
            });
            return;
          }
          return origSend.apply(this, arguments);
        };
      }
    } catch (_) {}
  }

  installNetworkHooks();

  // ==================== 特效画布 GPU 零开销拦截 ====================
  const EFFECT_CANVAS_CONTAINERS = [
    '.EffectPlayerDom',
    '.GiftEffect-box',
    '.GiftSvgaContainer',
    '.ConfigEffect',
    '.LuckyStarSvgaContainer',
    '.SvgaConfigEffect',
    '.DiamondsFansSvgaPlayerDom',
    '.AsideEffectPlayerDom',
    '.mp4EffctPlayer',
    '#js-spine-player',
    '#js-svgaV1-player',
    '.MMSvgaBaseContainer',
    '.ComboFireworks',
    '.JS-PlayerEffectWrap',
  ].join(',');

  function createNoopContextProxy(canvas) {
    const noop = function () { return proxy; };
    const target = function () {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'canvas') return canvas;
        if (prop === 'createImageData') return (w, h) => ({ width: w || 1, height: h || 1, data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) });
        if (prop === 'getImageData') return (_x, _y, w, h) => ({ width: w || 1, height: h || 1, data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) });
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getContextAttributes') return () => ({});
        if (prop === 'isContextLost') return () => false;
        if (prop === 'then') return undefined;
        return noop;
      },
      set() { return true; },
      apply() { return proxy; },
    });
    return proxy;
  }

  function installCanvasHook() {
    try {
      const Proto = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
      if (!Proto || typeof Proto.getContext !== 'function') return;
      const origGetContext = Proto.getContext;
      Proto.getContext = function () {
        try {
          if (config.blockEffects && this && typeof this.closest === 'function') {
            const cls = typeof this.className === 'string' ? this.className : '';
            if (!cls.includes('videoEnhanced') && !this.closest('#__video_container')) {
              if (this.closest(EFFECT_CANVAS_CONTAINERS)) {
                stats.killedCanvases++;
                if (this.width !== 0) this.width = 0;
                if (this.height !== 0) this.height = 0;
                return createNoopContextProxy(this);
              }
            }
          }
        } catch (_) {}
        return origGetContext.apply(this, arguments);
      };
    } catch (_) {}
  }

  installCanvasHook();

  // ==================== React 安全 DOM 节流清理 ====================
  let cleanScheduled = false;

  function runDomPurify() {
    cleanScheduled = false;
    syncHtmlDatasets();
    if (!isRoomPage()) return;

    // 1. 停止专题页/特效区推广 <video> 解码（严禁触碰 #__video2 与 #js-player-video）
    if (config.purifyTopic || config.blockEffects) {
      const videos = document.querySelectorAll('video.SampleVideo-video, .bc-wrapper video, .wm-general video, .mp4EffctPlayer video');
      for (const v of videos) {
        if (v.id === '__video2' || v.closest('#js-player-video')) continue;
        if (v.getAttribute('src') || !v.paused) {
          try {
            v.pause();
            v.removeAttribute('src');
            v.preload = 'none';
            v.load();
            stats.killedMedia++;
          } catch (_) {}
        }
      }
    }

    // 2. 清空后台冗余 iframe
    if (config.blockIframes) {
      const iframes = document.querySelectorAll('iframe[src*="ord-task-center"], iframe[src*="wxgamesdk"], iframe[src*="game.weixin.qq.com"], iframe.embed-msg');
      for (const ifr of iframes) {
        if (ifr.src && ifr.src !== 'about:blank') {
          try {
            ifr.src = 'about:blank';
            stats.killedMedia++;
          } catch (_) {}
        }
      }
    }
    if (!config.enableHighlight) {
      const hlIframes = document.querySelectorAll('iframe[src*="ai-live-summary"]');
      for (const ifr of hlIframes) {
        if (ifr.src && ifr.src !== 'about:blank') {
          try {
            ifr.src = 'about:blank';
            stats.killedMedia++;
          } catch (_) {}
        }
      }
    }

    // 3. 归零特效区 canvas 尺寸释放显存
    if (config.blockEffects) {
      const containers = document.querySelectorAll(EFFECT_CANVAS_CONTAINERS);
      for (const box of containers) {
        const canvases = box.querySelectorAll('canvas');
        for (const c of canvases) {
          if (c.width > 0 || c.height > 0) {
            c.width = 0;
            c.height = 0;
            stats.killedCanvases++;
          }
        }
      }
    }
  }

  function scheduleDomPurify() {
    if (cleanScheduled) return;
    cleanScheduled = true;
    setTimeout(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(runDomPurify);
      } else {
        runDomPurify();
      }
    }, 400);
  }

  function startObservers() {
    const target = document.body || document.documentElement;
    if (!target) return;
    const observer = new MutationObserver(() => {
      scheduleDomPurify();
    });
    observer.observe(target, { childList: true, subtree: true });
    runDomPurify();
  }

  // SPA 路由切换监听
  function installRouteHooks() {
    try {
      const wrapHistory = (fnName) => {
        const orig = history[fnName];
        if (typeof orig !== 'function') return;
        history[fnName] = function () {
          const res = orig.apply(this, arguments);
          syncHtmlDatasets();
          updateFloatBtnVisibility();
          scheduleDomPurify();
          return res;
        };
      };
      wrapHistory('pushState');
      wrapHistory('replaceState');
      win.addEventListener('popstate', () => {
        syncHtmlDatasets();
        updateFloatBtnVisibility();
        scheduleDomPurify();
      });
    } catch (_) {}
  }

  installRouteHooks();

  // ==================== Shadow DOM 轻量设置面板 ====================
  let uiHost = null;
  let uiShadow = null;
  let floatBtnEl = null;
  let modalEl = null;

  const SETTING_GROUPS = [
    {
      title: '画面与布局',
      items: [
        { key: 'purifyTopic', label: '净化专题页与皮肤背景', desc: '隐藏上下推广板块，移除皮肤大图与推广视频' },
        { key: 'hideGiftBar', label: '隐藏底部礼物栏', desc: '隐藏送礼/背包栏并自动向下扩展视频画面' },
        { key: 'wideLayout', label: '宽屏无边距布局', desc: '减小两侧留白，提升播放器可视面积' },
        { key: 'cleanHeader', label: '精简顶部导航栏', desc: '隐藏游戏/鱼吧/活动入口，保留搜索与登录' },
        { key: 'hideHeader', label: '沉浸模式隐藏顶栏', desc: '完全隐藏顶部导航栏（适合纯看直播）' },
        { key: 'hideWatermark', label: '隐藏画面房间水印', desc: '移除播放器角落“斗鱼 房间靓号”水印' },
        { key: 'enableHighlight', label: '开启“看点”功能（AI看点）', desc: '开启后保留控制栏“X个看点”、画面实时看点及右侧看点面板；关闭则隐藏并拦截' },
      ],
    },
    {
      title: '广告与特效',
      items: [
        { key: 'blockEffects', label: '屏蔽礼物/SVGA/VAP特效', desc: '拦截礼物/入场/连击全屏及侧边栏特效画布' },
        { key: 'blockAdsPendants', label: '屏蔽广告、挂件与弹窗', desc: '隐藏视频内贴片、PK条、竞猜、悬浮球与活动挂件' },
        { key: 'hideRank', label: '隐藏贵宾/贡献榜', desc: '扩大右侧弹幕列表高度（保留第三方真实人数）' },
        { key: 'cleanBarrage', label: '净化右侧弹幕流', desc: '过滤进房提醒、送礼通知、系统推广与顶部飘条' },
        { key: 'cleanChatTools', label: '精简发言栏冗余图标', desc: '隐藏喇叭/贵族/高能等付费按钮，保留表情与粉丝弹幕' },
      ],
    },
    {
      title: '性能与底层拦截',
      items: [
        { key: 'blockIframes', label: '拦截后台冗余 iframe', desc: '屏蔽任务中心、微信小游戏、私信等后台页面加载' },
        { key: 'blockNetwork', label: '拦截埋点/广告/特效请求', desc: '拦截 dotcounter/rtbapi/.svga/.vap（需刷新生效）' },
        { key: 'capBarrageDom', label: '限制弹幕列表渲染上限', desc: '仅保留最新 120 条弹幕可见，防止长时间观看卡顿' },
        { key: 'showFloatBtn', label: '显示右下角“净化”按钮', desc: '隐藏后仍可通过油猴扩展菜单打开设置' },
      ],
    },
  ];

  function ensureUI() {
    if (uiHost) return;
    if (!document.body) return;
    uiHost = document.createElement('div');
    uiHost.id = 'dyp-ui-host';
    uiShadow = uiHost.attachShadow({ mode: 'open' });

    uiShadow.innerHTML = `
      <style>
        :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
        .dyp-fab {
          position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
          padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16);
          background: rgba(18, 20, 28, 0.78); backdrop-filter: blur(8px);
          color: #f3f4f6; font-size: 12px; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35); transition: all .18s ease;
          user-select: none;
        }
        .dyp-fab:hover { background: rgba(255, 93, 35, 0.92); color: #fff; border-color: rgba(255, 93, 35, 0.9); }
        .dyp-fab.hidden { display: none; }
        .dyp-backdrop {
          position: fixed; inset: 0; z-index: 2147483640;
          background: rgba(0,0,0,0.58); backdrop-filter: blur(4px);
          display: none; align-items: center; justify-content: center;
        }
        .dyp-backdrop.open { display: flex; }
        .dyp-modal {
          width: min(520px, 92vw); max-height: 84vh; display: flex; flex-direction: column;
          background: #141720; color: #e5e7eb; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); overflow: hidden;
        }
        .dyp-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }
        .dyp-title { font-size: 15px; font-weight: 700; color: #fff; }
        .dyp-close {
          background: none; border: none; color: #9ca3af; font-size: 20px; line-height: 1;
          cursor: pointer; padding: 2px 6px; border-radius: 6px;
        }
        .dyp-close:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .dyp-stats {
          display: flex; gap: 10px; padding: 10px 18px; background: rgba(255, 93, 35, 0.08);
          border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #fdba74;
          flex-wrap: wrap;
        }
        .dyp-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
        .dyp-group-title {
          font-size: 12px; font-weight: 700; color: #ff7d23; margin: 12px 0 6px;
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        .dyp-group-title:first-child { margin-top: 2px; }
        .dyp-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .dyp-row:last-child { border-bottom: none; }
        .dyp-label { font-size: 13px; font-weight: 500; color: #f3f4f6; }
        .dyp-desc { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .dyp-switch {
          position: relative; width: 38px; height: 20px; flex-shrink: 0;
        }
        .dyp-switch input { opacity: 0; width: 0; height: 0; }
        .dyp-slider {
          position: absolute; inset: 0; background: #374151; border-radius: 999px;
          cursor: pointer; transition: .2s;
        }
        .dyp-slider:before {
          content: ""; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px;
          background: #fff; border-radius: 50%; transition: .2s;
        }
        .dyp-switch input:checked + .dyp-slider { background: #ff5d23; }
        .dyp-switch input:checked + .dyp-slider:before { transform: translateX(18px); }
        .dyp-foot {
          display: flex; align-items: center; justify-content: flex-end; gap: 10px;
          padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }
        .dyp-btn {
          padding: 7px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06); color: #e5e7eb; font-size: 12px; cursor: pointer;
        }
        .dyp-btn:hover { background: rgba(255,255,255,0.12); }
        .dyp-btn.primary { background: #ff5d23; border-color: #ff5d23; color: #fff; font-weight: 600; }
        .dyp-btn.primary:hover { background: #ff7038; }
      </style>
      <button class="dyp-fab" id="dyp-fab" title="斗鱼网页端净化设置">净化</button>
      <div class="dyp-backdrop" id="dyp-backdrop">
        <div class="dyp-modal" role="dialog" aria-label="斗鱼净化设置">
          <div class="dyp-head">
            <span class="dyp-title">斗鱼网页端极致净化</span>
            <button class="dyp-close" id="dyp-close" title="关闭">×</button>
          </div>
          <div class="dyp-stats" id="dyp-stats"></div>
          <div class="dyp-body" id="dyp-body"></div>
          <div class="dyp-foot">
            <button class="dyp-btn" id="dyp-reset">恢复默认</button>
            <button class="dyp-btn" id="dyp-reload">刷新页面</button>
            <button class="dyp-btn primary" id="dyp-done">完成</button>
          </div>
        </div>
      </div>
    `;

    floatBtnEl = uiShadow.getElementById('dyp-fab');
    modalEl = uiShadow.getElementById('dyp-backdrop');

    floatBtnEl.addEventListener('click', openSettingsModal);
    uiShadow.getElementById('dyp-close').addEventListener('click', closeSettingsModal);
    uiShadow.getElementById('dyp-done').addEventListener('click', closeSettingsModal);
    uiShadow.getElementById('dyp-reload').addEventListener('click', () => location.reload());
    uiShadow.getElementById('dyp-reset').addEventListener('click', () => {
      config = Object.assign({}, DEFAULT_CONFIG);
      saveConfig(config);
      syncHtmlDatasets();
      updateFloatBtnVisibility();
      renderModalBody();
      scheduleDomPurify();
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeSettingsModal();
    });

    document.body.appendChild(uiHost);
    updateFloatBtnVisibility();
  }

  function updateFloatBtnVisibility() {
    if (!floatBtnEl) return;
    const show = config.showFloatBtn && isRoomPage();
    floatBtnEl.classList.toggle('hidden', !show);
  }

  function renderModalStats() {
    if (!uiShadow) return;
    const el = uiShadow.getElementById('dyp-stats');
    if (!el) return;
    el.textContent = `已拦截请求: ${stats.blockedRequests}  |  已释放媒体/iframe: ${stats.killedMedia}  |  已拦截特效画布: ${stats.killedCanvases}`;
  }

  function renderModalBody() {
    if (!uiShadow) return;
    const body = uiShadow.getElementById('dyp-body');
    if (!body) return;
    body.innerHTML = '';

    for (const group of SETTING_GROUPS) {
      const gt = document.createElement('div');
      gt.className = 'dyp-group-title';
      gt.textContent = group.title;
      body.appendChild(gt);

      for (const item of group.items) {
        const row = document.createElement('div');
        row.className = 'dyp-row';

        const info = document.createElement('div');
        const lbl = document.createElement('div');
        lbl.className = 'dyp-label';
        lbl.textContent = item.label;
        const desc = document.createElement('div');
        desc.className = 'dyp-desc';
        desc.textContent = item.desc;
        info.appendChild(lbl);
        info.appendChild(desc);

        const sw = document.createElement('label');
        sw.className = 'dyp-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(config[item.key]);
        input.addEventListener('change', () => {
          config[item.key] = input.checked;
          saveConfig(config);
          syncHtmlDatasets();
          updateFloatBtnVisibility();
          scheduleDomPurify();
        });
        const slider = document.createElement('span');
        slider.className = 'dyp-slider';
        sw.appendChild(input);
        sw.appendChild(slider);

        row.appendChild(info);
        row.appendChild(sw);
        body.appendChild(row);
      }
    }
  }

  function openSettingsModal() {
    ensureUI();
    if (!modalEl) return;
    renderModalStats();
    renderModalBody();
    modalEl.classList.add('open');
  }

  function closeSettingsModal() {
    if (modalEl) modalEl.classList.remove('open');
  }

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('⚙️ 打开斗鱼净化设置', openSettingsModal);
    }
  } catch (_) {}

  function onReady() {
    syncHtmlDatasets();
    injectBaseStyles();
    startObservers();
    ensureUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
})();
