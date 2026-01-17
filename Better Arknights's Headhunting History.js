// ==UserScript==
// @name         Better Arknights's Headhunting History
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  View other players' Arknights gacha history
// @author       Elaina Da Catto
// @match        https://account.yo-star.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yo-star.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Class quản lý XHR Interceptor
     * Chặn và can thiệp vào các request gacha API
     */
    class XHRInterceptor {
        constructor(uidManager) {
            this.uidManager = uidManager;
            this.originalOpen = null;
            this.originalSend = null;
        }

        init() {
            this.originalOpen = XMLHttpRequest.prototype.open;
            this.originalSend = XMLHttpRequest.prototype.send;

            const self = this;

            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._url = url;
                return self.originalOpen.call(this, method, url, ...rest);
            };

            XMLHttpRequest.prototype.send = function(...args) {
                return self.handleSend.call(self, this, args);
            };

            console.log('XHR Interceptor initialized');
        }

        handleSend(xhr, args) {
            const otherUid = this.uidManager.getOtherUid();
            
            if (xhr._url && xhr._url.includes("/api/game/gachas")) {
                const u = new URL(xhr._url, location.origin);
                const uid = u.searchParams.get("uid");

                if (uid && this.uidManager.getPlayerUid() === 0) {
                    this.uidManager.setPlayerUid(uid);
                }

                if (otherUid !== 0) {
                    console.warn("Intercepted gacha request from web:", uid);
                    this.sendFakeResponse(xhr);
                    return;
                }
            }

            return this.originalSend.apply(xhr, args);
        }

        sendFakeResponse(xhr) {
            const fakeResponse = {
                code: 0,
                message: "ok",
                data: {
                    rows: [],
                    count: 0
                }
            };

            xhr.readyState = 4;
            xhr.status = 200;
            xhr.response = JSON.stringify(fakeResponse);
            xhr.responseText = JSON.stringify(fakeResponse);

            if (xhr.onreadystatechange) xhr.onreadystatechange();
            if (xhr.onload) xhr.onload();
        }
    }

    /**
     * Class quản lý UID
     */
    class UIDManager {
        constructor() {
            this.otherUid = 0;
            this.playerUid = 0;
        }

        getOtherUid() {
            return this.otherUid;
        }

        setOtherUid(uid) {
            this.otherUid = uid;
            console.log("otherUid updated:", uid);
        }

        getPlayerUid() {
            return this.playerUid;
        }

        setPlayerUid(uid) {
            this.playerUid = uid;
        }

        isValidUid(uid) {
            return uid !== 0 && uid !== this.playerUid;
        }
    }

    /**
     * Class quản lý API
     */
    class GachaAPI {
        constructor(uidManager) {
            this.uidManager = uidManager;
            this.gachaTypes = [
                "Regular+Headhunting",
                "Limited+Headhunting",
                "Special+Headhunting"
            ];
            this.baseURL = "https://account.yo-star.com/api/game/gachas";
        }

        async fetchGachaHistory(typeIndex, uid) {
            if (!this.uidManager.isValidUid(uid)) {
                console.warn("UID chưa hợp lệ");
                return null;
            }

            try {
                const url = this.buildURL(typeIndex, uid);
                const response = await fetch(url, {
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "lang": "en",
                    },
                    referrer: "https://account.yo-star.com/game-info?game=ark&tab=gacha",
                    method: "GET"
                });

                const data = await response.json();
                return data;
            } catch (error) {
                console.error("Error fetching gacha history:", error);
                return null;
            }
        }

        buildURL(typeIndex, uid) {
            const type = this.gachaTypes[typeIndex];
            return `${this.baseURL}?key=ark&index=1&size=10000&type=${type}&uid=${uid}`;
        }
    }

    /**
     * Class quản lý UI
     */
    class UIManager {
        constructor() {
            this.observer = null;
        }

        initObserver(callback) {
            this.observer = new MutationObserver(() => {
                const tabs = document.querySelector(".tabs");
                if (tabs) {
                    callback();
                    this.observer.disconnect();
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        addUidInput() {
            if (document.getElementById("uid-input")) return;

            const tabs = document.querySelector(".tabs");
            if (!tabs) return;

            tabs.style.display = "flex";
            tabs.style.alignItems = "center";

            const uidWrapper = this.createUidWrapper();
            tabs.appendChild(uidWrapper);

            console.log('UID input added');
        }

        createUidWrapper() {
            const uidWrapper = document.createElement("div");
            uidWrapper.id = "uid-wrapper";
            uidWrapper.style.cssText = `
                display: flex;
                align-items: center;
                gap: 0.15rem;
                border: 2px solid;
                border-radius: 6px;
                padding: 0.1rem 0.2rem;
                margin-bottom: 0.2rem;
            `;
            uidWrapper.innerHTML = `
                <input
                    id="uid-input"
                    type="text"
                    placeholder="Enter UID"
                    style="width: 1.8rem; font-size: 0.24rem; padding: 0.05rem 0.1rem; border: 1px solid #ccc; border-radius: 4px;"
                />
                <input
                    id="date-from"
                    type="date"
                    placeholder="From"
                    style="width: 1.5rem; font-size: 0.22rem; padding: 0.05rem; border: 1px solid #ccc; border-radius: 4px;"
                />
                <span style="font-size: 0.22rem; color: #666;">~</span>
                <input
                    id="date-to"
                    type="date"
                    placeholder="To"
                    style="width: 1.5rem; font-size: 0.22rem; padding: 0.05rem; border: 1px solid #ccc; border-radius: 4px;"
                />
                <span id="gacha-count" style="font-size: 0.24rem; white-space: nowrap; color: #333; font-weight: 500;">
                    Gacha time: 0
                </span>
            `;
            return uidWrapper;
        }

        renderGachaHistory(apiResponse) {
            if (!apiResponse || apiResponse.code !== 0) {
                console.error("Data không hợp lệ");
                return;
            }

            const rows = apiResponse.data.rows;
            const count = apiResponse.data.count || 0;
            const gachaRoot = document.querySelector(".gacha");

            console.log("Rendering gacha history:", rows.length, "items");

            if (!gachaRoot) {
                console.error("Không tìm thấy .gacha element");
                return;
            }

            this.clearEmptyState(gachaRoot);
            
            const filteredRows = this.filterRowsByDate(rows);
            this.renderRows(gachaRoot, filteredRows);
            
            this.updateGachaCount(filteredRows.length, count);
        }

        filterRowsByDate(rows) {
            const dateFrom = document.getElementById("date-from")?.value;
            const dateTo = document.getElementById("date-to")?.value;

            if (!dateFrom && !dateTo) {
                return rows;
            }

            return rows.filter(item => {
                if (!item.atStr) return true;
                
                const itemDate = item.atStr.split(' ')[0];

                if (dateFrom && itemDate < dateFrom) return false;
                if (dateTo && itemDate > dateTo) return false;
                
                return true;
            });
        }

        updateGachaCount(filtered, total) {
            const gachaCountElement = document.getElementById("gacha-count");
            if (gachaCountElement) {
                if (filtered === total) {
                    gachaCountElement.textContent = `Gacha time: ${total}`;
                } else {
                    gachaCountElement.textContent = `Gacha time: ${filtered}/${total}`;
                }
            }
        }

        clearEmptyState(gachaRoot) {
            const empty = gachaRoot.querySelector(".content-empty");
            if (empty) empty.remove();
            
            const oldRows = gachaRoot.querySelectorAll(".tr");
            oldRows.forEach(row => row.remove());
        }

        renderRows(gachaRoot, rows) {
            rows.forEach(item => {
                const row = this.createGachaRow(item);
                gachaRoot.appendChild(row);
            });
        }

        createGachaRow(item) {
            const tr = document.createElement("div");
            tr.className = "tr";
            tr.style.cssText = `
                display: flex;
                align-items: center;
                border-bottom: 1px dashed #e6e6e6;
            `;

            tr.innerHTML = `
                <div class="ellipsis" style="flex: 1;padding: .2857142857rem .1714285714rem; font-size: .2571428571rem; line-height: .3428571429rem;">
                    ${item.poolName}
                </div>
                <div class="ellipsis" style="color:${item.color}; flex: 1;padding: .2857142857rem .1714285714rem; font-size: .2571428571rem; line-height: .3428571429rem;">
                    ${item.charName}
                </div>
                <div class="time" style="flex: 1;padding: .2857142857rem .1714285714rem; font-size: .2571428571rem; line-height: .3428571429rem; color: rgba(0, 0, 0, .56);">
                    ${item.atStr}
                </div>
            `;

            return tr;
        }
    }

    /**
     * Class quản lý Event Handlers
     */
    class EventHandler {
        constructor(uidManager, gachaAPI, uiManager) {
            this.uidManager = uidManager;
            this.gachaAPI = gachaAPI;
            this.uiManager = uiManager;
            this.cachedData = null; // Cache data để re-render khi thay đổi date
            this.gachaTypeMap = {
                "Regular Headhunting": 0,
                "Limited Headhunting": 1,
                "Special Headhunting": 2
            };
        }

        init() {
            this.initInputListener();
            this.initDateListener();
            this.initClickListener();
            console.log('Event handlers initialized');
        }

        initInputListener() {
            document.body.addEventListener("input", (e) => {
                if (e.target.id === "uid-input") {
                    const value = e.target.value.trim();
                    const uid = value === "" ? 0 : Number(value);
                    this.uidManager.setOtherUid(uid);
                }
            });
        }

        initDateListener() {
            document.body.addEventListener("change", (e) => {
                if (e.target.id === "date-from" || e.target.id === "date-to") {
                    if (this.cachedData) {
                        this.uiManager.renderGachaHistory(this.cachedData);
                    }
                }
            });
        }

        initClickListener() {
            document.body.addEventListener("click", async (e) => {
                const btn = e.target.closest("button, li");
                if (!btn) return;

                const buttonText = btn.textContent.trim();
                await this.handleGachaButtonClick(buttonText);
            });
        }

        async handleGachaButtonClick(buttonText) {
            const typeIndex = this.gachaTypeMap[buttonText];
            
            if (typeIndex !== undefined) {
                const uid = this.uidManager.getOtherUid();
                const data = await this.gachaAPI.fetchGachaHistory(typeIndex, uid);
                
                if (data) {
                    this.cachedData = data;
                    this.uiManager.renderGachaHistory(data);
                }
            }
        }
    }

    /**
     * Main Application Class
     */
    class ArknightsGachaViewer {
        constructor() {
            this.uidManager = new UIDManager();
            this.xhrInterceptor = new XHRInterceptor(this.uidManager);
            this.gachaAPI = new GachaAPI(this.uidManager);
            this.uiManager = new UIManager();
            this.eventHandler = new EventHandler(
                this.uidManager,
                this.gachaAPI,
                this.uiManager
            );
        }

        run() {
            console.log('Arknights Gacha Viewer starting...');
            
            this.xhrInterceptor.init();
            
            this.uiManager.initObserver(() => {
                this.uiManager.addUidInput();
            });
            
            this.eventHandler.init();
        }
    }

    const app = new ArknightsGachaViewer();
    app.run();
})();