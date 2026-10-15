// ============================================================
// 수퍼마켓 8개 매장 지도 대시보드 - 핵심 바닐라 자바스크립트 로직
// ============================================================

(function () {
  "use strict";

  // 1. 브랜드별 시각화 컬러 및 한 글자 약어 정의
  const BRAND_CONFIG = {
    "이마트": { color: "#f59e0b", label: "이마트", symbol: "이" },
    "홈플러스": { color: "#e11d48", label: "홈플러스", symbol: "홈" },
    "롯데마트": { color: "#be123c", label: "롯데마트", symbol: "롯" },
    "메가마트": { color: "#ea580c", label: "메가마트", symbol: "메" },
    "탑마트": { color: "#15803d", label: "탑마트", symbol: "탑" },
    "하나로마트": { color: "#059669", label: "하나로마트", symbol: "하" },
    "케이마트": { color: "#2563eb", label: "케이마트", symbol: "K" },
    "기타 로컬마트": { color: "#7c3aed", label: "기타 로컬마트", symbol: "기" }
  };

  const BUSAN_CENTER = [35.1795543, 129.0756416];
  const BUSAN_DEFAULT_ZOOM = 11;

  // 2. 애플리케이션 상태 (State)
  const state = {
    stores: Array.isArray(window.STORES_DATA) ? window.STORES_DATA : [],
    searchQuery: "",
    selectedDistrict: "all",
    selectedBrands: new Set(Object.keys(BRAND_CONFIG)),
    activeStoreId: null,
    filteredStores: []
  };

  // 3. 지도 및 마커 객체 참조
  let map = null;
  let markerClusterGroup = null;
  const storeMarkerMap = new Map(); // id -> L.marker 매핑

  // 4. 초기화 함수
  function init() {
    initTheme();
    initMap();
    initDistrictFilter();
    initBrandChips();
    initLegend();
    bindEvents();
    applyFilter();
  }

  // 테마 초기화
  function initTheme() {
    const savedTheme = localStorage.getItem("store_map_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  // Leaflet 지도 초기화
  function initMap() {
    map = L.map("map", {
      center: BUSAN_CENTER,
      zoom: BUSAN_DEFAULT_ZOOM,
      zoomControl: true
    });

    // OpenStreetMap 무료 타일 레이어
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 마커 클러스터 그룹 초기화
    if (typeof L.markerClusterGroup === "function") {
      markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: function (cluster) {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div style="background: rgba(37, 99, 235, 0.9); color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); font-size: 13px;">${count}</div>`,
            className: "custom-cluster-icon",
            iconSize: L.point(36, 36)
          });
        }
      });
      map.addLayer(markerClusterGroup);
    } else {
      // 플러그인 로드 안 될 경우 대비 기본 레이어 그룹
      markerClusterGroup = L.layerGroup().addTo(map);
    }
  }

  // 자치구 셀렉트 박스 옵션 생성
  function initDistrictFilter() {
    const districtSelect = document.getElementById("district-select");
    if (!districtSelect) return;

    const districts = Array.from(new Set(state.stores.map((s) => s.district).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, "ko")
    );

    districtSelect.innerHTML = '<option value="all">전체 자치구 (부산 전역)</option>';
    districts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      districtSelect.appendChild(opt);
    });
  }

  // 브랜드 토글 칩스 생성
  function initBrandChips() {
    const container = document.getElementById("brand-chips-grid");
    if (!container) return;

    container.innerHTML = "";
    Object.keys(BRAND_CONFIG).forEach((brandKey) => {
      const config = BRAND_CONFIG[brandKey];
      const count = state.stores.filter((s) => s.brandGroup === brandKey).length;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "brand-chip active";
      chip.dataset.brand = brandKey;
      chip.style.setProperty("--brand-color", config.color);
      chip.innerHTML = `
        <span class="dot" style="background-color: ${config.color};"></span>
        <span>${config.label}</span>
        <span style="font-size: 10px; opacity: 0.7;">(${count})</span>
      `;

      chip.addEventListener("click", () => {
        if (state.selectedBrands.has(brandKey)) {
          if (state.selectedBrands.size > 1) {
            state.selectedBrands.delete(brandKey);
            chip.classList.remove("active");
          } else {
            // 최소 1개는 켜두기 (또는 토글 허용)
            state.selectedBrands.delete(brandKey);
            chip.classList.remove("active");
          }
        } else {
          state.selectedBrands.add(brandKey);
          chip.classList.add("active");
        }
        applyFilter();
      });

      container.appendChild(chip);
    });
  }

  // 우측 하단 지도 범례 생성
  function initLegend() {
    const legendGrid = document.getElementById("legend-grid");
    if (!legendGrid) return;

    legendGrid.innerHTML = "";
    Object.keys(BRAND_CONFIG).forEach((brandKey) => {
      const config = BRAND_CONFIG[brandKey];
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `
        <span class="legend-color" style="background-color: ${config.color};"></span>
        <span>${config.label}</span>
      `;
      legendGrid.appendChild(item);
    });
  }

  // 5. 이벤트 리스너 바인딩
  function bindEvents() {
    // 실시간 검색
    const searchInput = document.getElementById("search-input");
    const clearSearchBtn = document.getElementById("clear-search-btn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        if (clearSearchBtn) {
          clearSearchBtn.style.display = state.searchQuery ? "block" : "none";
        }
        applyFilter();
      });
    }

    if (clearSearchBtn && searchInput) {
      clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.searchQuery = "";
        clearSearchBtn.style.display = "none";
        searchInput.focus();
        applyFilter();
      });
    }

    // 자치구 변경
    const districtSelect = document.getElementById("district-select");
    if (districtSelect) {
      districtSelect.addEventListener("change", (e) => {
        state.selectedDistrict = e.target.value;
        applyFilter();
      });
    }

    // 브랜드 전체 선택/해제 토글 버튼
    const toggleAllBrandsBtn = document.getElementById("toggle-all-brands-btn");
    if (toggleAllBrandsBtn) {
      toggleAllBrandsBtn.addEventListener("click", () => {
        const allBrands = Object.keys(BRAND_CONFIG);
        const chips = document.querySelectorAll(".brand-chip");

        if (state.selectedBrands.size === allBrands.length) {
          // 전체 해제 -> 첫번째만 남기거나 0개
          state.selectedBrands.clear();
          chips.forEach((c) => c.classList.remove("active"));
        } else {
          // 전체 선택
          allBrands.forEach((b) => state.selectedBrands.add(b));
          chips.forEach((c) => c.classList.add("active"));
        }
        applyFilter();
      });
    }

    // 필터 초기화 버튼
    const resetFiltersBtn = document.getElementById("reset-filters-btn");
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
        if (districtSelect) districtSelect.value = "all";

        state.searchQuery = "";
        state.selectedDistrict = "all";
        state.selectedBrands = new Set(Object.keys(BRAND_CONFIG));

        document.querySelectorAll(".brand-chip").forEach((c) => c.classList.add("active"));
        applyFilter();
        resetMapView();
      });
    }

    // 지도 리셋 버튼 (부산 전체보기)
    const resetMapBtn = document.getElementById("btn-reset-map");
    if (resetMapBtn) {
      resetMapBtn.addEventListener("click", resetMapView);
    }

    // 내 위치 보기 버튼
    const myLocationBtn = document.getElementById("btn-my-location");
    if (myLocationBtn) {
      myLocationBtn.addEventListener("click", handleMyLocation);
    }

    // 테마 토글 버튼
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("store_map_theme", nextTheme);
      });
    }

    // 모바일 사이드바 열고 닫기 버튼
    const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
    const sidebar = document.getElementById("sidebar");
    if (mobileToggleBtn && sidebar) {
      mobileToggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        const isOpen = sidebar.classList.contains("open");
        mobileToggleBtn.innerHTML = isOpen
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> 목록 닫기`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg> 매장 목록 (${state.filteredStores.length})`;
      });
    }
  }

  // 6. 필터 적용 및 렌더링
  function applyFilter() {
    const q = state.searchQuery;
    const district = state.selectedDistrict;
    const brands = state.selectedBrands;

    state.filteredStores = state.stores.filter((store) => {
      // 브랜드 필터
      if (!brands.has(store.brandGroup)) return false;

      // 자치구 필터
      if (district !== "all" && store.district !== district) return false;

      // 검색어 필터
      if (q) {
        const target = `${store.name} ${store.branch} ${store.address} ${store.dong}`.toLowerCase();
        if (!target.includes(q)) return false;
      }

      // 위도/경도 유효성 검사
      if (!store.lat || !store.lng) return false;

      return true;
    });

    updateStats();
    renderMarkers();
    renderStoreList();
  }

  // 상단 통계 숫자 갱신
  function updateStats() {
    const currentCountEl = document.getElementById("stat-current-count");
    const totalCountEl = document.getElementById("stat-total-count");

    if (currentCountEl) currentCountEl.textContent = state.filteredStores.length;
    if (totalCountEl) totalCountEl.textContent = state.stores.length;

    // 모바일 버튼 텍스트도 갱신
    const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
    if (mobileToggleBtn && !document.getElementById("sidebar")?.classList.contains("open")) {
      mobileToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg> 매장 목록 (${state.filteredStores.length})`;
    }
  }

  // 7. 지도 마커 렌더링
  function renderMarkers() {
    if (!markerClusterGroup) return;

    markerClusterGroup.clearLayers();
    storeMarkerMap.clear();

    const bounds = L.latLngBounds([]);

    state.filteredStores.forEach((store) => {
      const brandConf = BRAND_CONFIG[store.brandGroup] || { color: "#64748b", symbol: "M" };

      // 커스텀 HTML 핀 아이콘
      const customIcon = L.divIcon({
        className: "custom-pin-wrapper",
        html: `
          <div class="custom-pin" style="--pin-color: ${brandConf.color};">
            <span class="custom-pin-inner">${brandConf.symbol}</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([store.lat, store.lng], { icon: customIcon });

      // 길찾기 URL 인코딩
      const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(store.name + (store.branch ? " " + store.branch : ""))},${store.lat},${store.lng}`;
      const naverUrl = `https://map.naver.com/v5/search/${encodeURIComponent(store.address || store.name)}`;

      const popupHtml = `
        <div class="popup-container">
          <span class="popup-badge" style="background-color: ${brandConf.color};">${store.brandGroup}</span>
          <div class="popup-title">${store.name} ${store.branch ? `<span style="font-weight: 500; font-size: 0.85em; opacity: 0.8;">(${store.branch})</span>` : ""}</div>
          <div class="popup-address">
            <div style="font-weight: 600; color: var(--text-main);">${store.district} ${store.dong || ""}</div>
            <div>${store.address}</div>
          </div>
          <div class="popup-actions">
            <a href="${kakaoUrl}" target="_blank" rel="noopener noreferrer" class="popup-link-btn kakao">카카오맵 길찾기</a>
            <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="popup-link-btn naver">네이버지도</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      // 마커 클릭 시 해당 카드 선택 및 스크롤
      marker.on("click", () => {
        selectStoreCard(store.id, false);
      });

      markerClusterGroup.addLayer(marker);
      storeMarkerMap.set(store.id, marker);
      bounds.extend([store.lat, store.lng]);
    });

    // 필터링 결과가 있고 검색이나 자치구 선택 시 적절히 지도 바운드 맞춤
    if (state.filteredStores.length > 0 && (state.searchQuery || state.selectedDistrict !== "all")) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }

  // 8. 사이드바 매장 카드 목록 렌더링
  function renderStoreList() {
    const listContainer = document.getElementById("store-list");
    if (!listContainer) return;

    if (state.filteredStores.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
            <path d="M11 8v6M8 11h6"></path>
          </svg>
          <div style="font-weight: 700; color: var(--text-main);">조건에 맞는 매장이 없습니다</div>
          <div style="font-size: 0.8rem;">검색어 또는 브랜드 필터를 다시 확인해 주세요.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = "";
    state.filteredStores.forEach((store) => {
      const brandConf = BRAND_CONFIG[store.brandGroup] || { color: "#64748b" };

      const card = document.createElement("div");
      card.className = "store-card";
      card.id = `card-${store.id}`;
      card.style.setProperty("--card-color", brandConf.color);

      if (state.activeStoreId === store.id) {
        card.classList.add("selected");
      }

      card.innerHTML = `
        <div class="card-top">
          <span class="card-badge">${store.brandGroup}</span>
          <span class="card-district">${store.district} · ${store.dong || ""}</span>
        </div>
        <div class="card-title">
          ${store.name}
          ${store.branch ? `<span class="card-branch">${store.branch}</span>` : ""}
        </div>
        <div class="card-address">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;">
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>${store.address}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        selectStoreCard(store.id, true);
      });

      listContainer.appendChild(card);
    });
  }

  // 매장 카드 선택 시 동작
  function selectStoreCard(storeId, flyToMap = true) {
    state.activeStoreId = storeId;

    // 카드 스타일 갱신
    document.querySelectorAll(".store-card").forEach((card) => {
      card.classList.remove("selected");
    });
    const targetCard = document.getElementById(`card-${storeId}`);
    if (targetCard) {
      targetCard.classList.add("selected");
      targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // 마커 이동 및 팝업 열기
    const marker = storeMarkerMap.get(storeId);
    if (marker && flyToMap) {
      const latLng = marker.getLatLng();

      // 모바일 화면에서는 사이드바가 덮지 않도록 약간 오프셋 고려 가능
      map.flyTo(latLng, 16, { animate: true, duration: 0.8 });

      // 클러스터 안에 있을 경우 먼저 펼치기
      if (markerClusterGroup && typeof markerClusterGroup.zoomToShowLayer === "function") {
        markerClusterGroup.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
      } else {
        marker.openPopup();
      }

      // 모바일에서는 카드를 클릭하면 지도를 볼 수 있도록 사이드바를 닫아주는 편의 기능
      if (window.innerWidth <= 860) {
        const sidebar = document.getElementById("sidebar");
        const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
        if (sidebar && sidebar.classList.contains("open")) {
          sidebar.classList.remove("open");
          if (mobileToggleBtn) {
            mobileToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg> 매장 목록 (${state.filteredStores.length})`;
          }
        }
      }
    }
  }

  // 부산 전체 뷰로 리셋
  function resetMapView() {
    if (map) {
      map.flyTo(BUSAN_CENTER, BUSAN_DEFAULT_ZOOM, { animate: true, duration: 0.8 });
    }
  }

  // 내 위치 확인
  function handleMyLocation() {
    if (!navigator.geolocation) {
      alert("브라우저가 위치 정보를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.flyTo([lat, lng], 15, { animate: true });

        // 내 위치 마커 표시
        L.circleMarker([lat, lng], {
          radius: 8,
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          weight: 3
        })
          .addTo(map)
          .bindPopup("<b>내 현재 위치</b>")
          .openPopup();
      },
      (err) => {
        alert("현재 위치를 불러올 수 없습니다. 브라우저 위치 권한을 확인해 주세요.");
      },
      { timeout: 8000 }
    );
  }

  // DOM 로드 시 즉시 시작
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
